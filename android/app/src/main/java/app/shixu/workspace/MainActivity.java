package app.shixu.workspace;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String ORIGIN = "https://8.147.235.91";
    private static final int PICK_JSON = 100, SAVE_JSON = 101;
    private static final long MAX_EXPORT = 64L * 1024 * 1024;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private WebView web;
    private ProgressBar progress;
    private LinearLayout errorView;
    private ValueCallback<Uri[]> picker;
    private WebMessagePort exportPort;
    private File exportFile;
    private FileOutputStream exportOutput;
    private String token, exportName, lastUrl = ORIGIN + "/";
    private long totalBytes, expectedBytes;
    private int nextSequence;
    private boolean saving;

    private boolean trusted(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        return "https".equals(uri.getScheme()) && "8.147.235.91".equals(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(248, 249, 252));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets keyboard = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, keyboard.bottom));
                return WindowInsets.CONSUMED;
            });
        }
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(248, 249, 252));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true); settings.setSupportMultipleWindows(false);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        FrameLayout.LayoutParams progressLayout = new FrameLayout.LayoutParams(-1, 6, Gravity.TOP);
        root.addView(progress, progressLayout);
        errorView = new LinearLayout(this); errorView.setOrientation(LinearLayout.VERTICAL);
        errorView.setGravity(Gravity.CENTER); errorView.setPadding(48, 32, 48, 32);
        errorView.setBackgroundColor(Color.rgb(248, 249, 252));
        TextView message = new TextView(this); message.setText("暂时无法打开工作台\n\n请检查网络后重试，本机记录会保留。");
        message.setTextSize(17); message.setGravity(Gravity.CENTER);
        Button retry = new Button(this); retry.setText("重新连接"); retry.setOnClickListener(v -> web.loadUrl(lastUrl));
        errorView.addView(message); errorView.addView(retry); errorView.setVisibility(View.GONE);
        root.addView(errorView, new FrameLayout.LayoutParams(-1, -1)); setContentView(root);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (trusted(url)) return false;
                if (url.startsWith("blob:" + ORIGIN + "/")) return false;
                if (request.isForMainFrame() && request.hasGesture()
                    && ("https".equals(request.getUrl().getScheme()) || "http".equals(request.getUrl().getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); } catch (Exception ignored) { notice("无法打开此链接。"); }
                }
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                if (trusted(url)) lastUrl = url;
                errorView.setVisibility(View.GONE); progress.setVisibility(View.VISIBLE); closePort();
            }
            @Override public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
                if (trusted(url) && errorView.getVisibility() != View.VISIBLE) attachExportPort();
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showError();
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) { handler.cancel(); showError(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) { progress.setProgress(value); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (picker != null) picker.onReceiveValue(null);
                picker = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
                try { startActivityForResult(intent, PICK_JSON); } catch (Exception error) { picker.onReceiveValue(null); picker = null; notice("无法打开文件选择器。"); }
                return true;
            }
        });
        web.setDownloadListener((url, agent, disposition, type, size) -> beginExport(url));
        if (state == null || web.restoreState(state) == null) web.loadUrl(ORIGIN + "/");
    }
    private void notice(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }
    private void showError() { progress.setVisibility(View.GONE); errorView.setVisibility(View.VISIBLE); }
    private String asset(String name) throws Exception {
        try (InputStream input = getAssets().open(name); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }
    private void attachExportPort() {
        try {
            closePort(); WebMessagePort[] ports = web.createWebMessageChannel(); exportPort = ports[0];
            exportPort.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
                @Override public void onMessage(WebMessagePort port, WebMessage message) { receiveExport(message.getData()); }
            });
            String channelToken = UUID.randomUUID().toString();
            web.evaluateJavascript(asset("export.js").replace("__SHIXU_CHANNEL_TOKEN__", channelToken), ignored -> {
                if (trusted(web.getUrl())) web.postWebMessage(new WebMessage("shixu-export-channel:" + channelToken, new WebMessagePort[]{ports[1]}), Uri.parse(ORIGIN));
            });
        } catch (Exception error) { notice("备份通道未就绪，请重新打开页面后重试。"); }
    }
    private void beginExport(String url) {
        if (!trusted(web.getUrl()) || !url.startsWith("blob:" + ORIGIN + "/") || exportPort == null) { notice("请在工作台内导出 JSON 备份。"); return; }
        if (token != null || saving) { notice("请先完成当前备份保存。"); return; }
        token = UUID.randomUUID().toString(); exportName = "拾序备份-" + new java.text.SimpleDateFormat("yyyyMMdd-HHmmss", java.util.Locale.ROOT).format(new java.util.Date()) + ".json";
        String activeToken = token;
        web.evaluateJavascript("window.__shixuExport && window.__shixuExport(" + JSONObject.quote(token) + "," + JSONObject.quote(url) + ")", null);
        main.postDelayed(() -> { if (activeToken.equals(token) && (exportOutput != null || exportFile == null)) failExport("备份传输超时，请重试。"); }, 120000);
    }
    private void receiveExport(String text) {
        if (token == null || !trusted(web.getUrl())) return;
        try {
            if (text == null || text.length() > 75000) throw new Exception("备份片段过大。");
            JSONObject message = new JSONObject(text);
            if (!token.equals(message.optString("token"))) return;
            if ("error".equals(message.optString("type"))) { failExport(message.optString("message", "备份未完成，请重试。")); return; }
            int sequence = message.getInt("seq"); String type = message.getString("type");
            if ("start".equals(type)) {
                expectedBytes = message.getLong("size");
                if (exportFile != null || sequence != 0 || expectedBytes < 1 || expectedBytes > MAX_EXPORT) throw new Exception("备份大小不支持，请在电脑端导出。");
                exportFile = File.createTempFile("shixu-export-", ".json", getCacheDir());
                exportOutput = new FileOutputStream(exportFile); totalBytes = 0; nextSequence = 1;
            } else if ("chunk".equals(type)) {
                if (exportOutput == null || sequence != nextSequence++) throw new Exception("备份片段顺序异常，请重试。");
                byte[] bytes = Base64.decode(message.getString("data"), Base64.DEFAULT);
                totalBytes += bytes.length;
                if (bytes.length > 49152 || totalBytes > expectedBytes) throw new Exception("备份大小异常，请重试。");
                exportOutput.write(bytes);
            } else if ("end".equals(type)) {
                if (exportOutput == null || sequence != nextSequence || totalBytes != expectedBytes) throw new Exception("备份未完整接收，请重试。");
                exportOutput.close(); exportOutput = null;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, exportName); startActivityForResult(intent, SAVE_JSON);
            } else throw new Exception("未知的备份请求。");
            JSONObject reply = new JSONObject().put("token", token).put("seq", sequence);
            exportPort.postMessage(new WebMessage(reply.toString()));
        } catch (Exception error) { failExport(error.getMessage() == null ? "备份未完成，请重试。" : error.getMessage()); }
    }
    private void failExport(String reason) { clearExport(); notice(reason); }
    private void clearExport() {
        try { if (exportOutput != null) exportOutput.close(); } catch (Exception ignored) { }
        exportOutput = null;
        if (exportFile != null) exportFile.delete();
        exportFile = null; token = null;
    }
    private void closePort() {
        if (exportPort != null) { exportPort.close(); exportPort = null; }
        if (!saving) clearExport();
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_JSON && picker != null) {
            picker.onReceiveValue(result == RESULT_OK && data != null && data.getData() != null ? new Uri[]{data.getData()} : null); picker = null;
        }
        if (request == SAVE_JSON) {
            if (result != RESULT_OK || data == null || data.getData() == null || exportFile == null) { clearExport(); return; }
            File source = exportFile; Uri destination = data.getData(); saving = true;
            io.execute(() -> {
                boolean success = false;
                try (InputStream input = new FileInputStream(source); OutputStream output = getContentResolver().openOutputStream(destination, "wt")) {
                    if (output == null) throw new Exception("文件不可写");
                    byte[] buffer = new byte[32768]; int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                    output.flush(); success = true;
                } catch (Exception ignored) { }
                final boolean complete = success;
                main.post(() -> { saving = false; clearExport(); notice(complete ? "备份已保存到选择的位置。" : "备份保存失败，请重试。"); });
            });
        }
    }
    @Override protected void onSaveInstanceState(Bundle state) { super.onSaveInstanceState(state); web.saveState(state); }
    @Override protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); }
    @Override public void onBackPressed() {
        if (errorView.getVisibility() == View.VISIBLE) { super.onBackPressed(); return; }
        web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(d){d.close();return true;}if(document.querySelector('.modal,.drawer')){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true;}return false;})()", handled -> {
            if (!"true".equals(handled)) { if (web.canGoBack()) web.goBack(); else MainActivity.super.onBackPressed(); }
        });
    }
    @Override protected void onDestroy() {
        if (picker != null) picker.onReceiveValue(null);
        closePort(); web.destroy(); io.shutdown(); super.onDestroy();
    }
}
