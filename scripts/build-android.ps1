param(
    [string]$SdkRoot = $env:ANDROID_HOME,
    [string]$JavaDirectory = $env:JAVA_HOME,
    [switch]$IncludeDebug
)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path $PSScriptRoot -Parent
if (-not $SdkRoot) { $SdkRoot = $env:ANDROID_SDK_ROOT }
if (-not $SdkRoot -and (Test-Path 'D:\env\Android')) { $SdkRoot = 'D:\env\Android' }
if (-not $SdkRoot) { $SdkRoot = Join-Path $env:USERPROFILE 'AppData\Local\Android\Sdk' }
if (-not $JavaDirectory -and (Test-Path 'D:\sortware\AndroidStudio\jbr')) { $JavaDirectory = 'D:\sortware\AndroidStudio\jbr' }
if (-not $JavaDirectory) { throw 'Set JAVA_HOME to a Java 17+ JDK.' }
$keytool = Join-Path $JavaDirectory 'bin\keytool.exe'
if (-not (Test-Path -LiteralPath $keytool)) { throw 'JDK keytool is unavailable.' }
if (-not (Test-Path -LiteralPath (Join-Path $SdkRoot 'platforms\android-35\android.jar'))) { throw 'Install Android SDK Platform 35.' }
$env:JAVA_HOME = $JavaDirectory
$env:ANDROID_HOME = $SdkRoot
# Use a canonical Windows path for the JVM selector wakeup socket, rather than
# an inherited 8.3 TEMP alias that can break AF_UNIX in Windows JDKs.
$javaTemp = Join-Path $workspace '.tools\android-java-tmp'
New-Item -ItemType Directory -Path $javaTemp -Force | Out-Null
$env:TEMP = [System.IO.Path]::GetFullPath($javaTemp)
$env:TMP = $env:TEMP
$signingDirectory = Join-Path $workspace '.signing\android'
New-Item -ItemType Directory -Path $signingDirectory -Force | Out-Null
$keyPath = Join-Path $signingDirectory 'shixu-release.jks'
$propertiesPath = Join-Path $signingDirectory 'keystore.properties'
if (-not (Test-Path -LiteralPath $keyPath)) {
    if (Test-Path -LiteralPath $propertiesPath) { throw 'Signing password exists but the key is missing. Restore the original signing key.' }
    $randomBytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($randomBytes) } finally { $rng.Dispose() }
    $env:SHIXU_STOREPASS = [Convert]::ToBase64String($randomBytes).TrimEnd('=').Replace('+','-').Replace('/','_')
    try {
        & $keytool -genkeypair -keystore $keyPath -storetype JKS -alias shixu -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Shixu Android, OU=Apps, O=Shixu, C=CN' -storepass:env SHIXU_STOREPASS -keypass:env SHIXU_STOREPASS -noprompt
        if ($LASTEXITCODE -ne 0) { throw 'Signing key generation failed.' }
        [System.IO.File]::WriteAllText($propertiesPath, ('storePassword=' + $env:SHIXU_STOREPASS + "`nkeyPassword=" + $env:SHIXU_STOREPASS + "`n"), [System.Text.UTF8Encoding]::new($false))
    } finally { Remove-Item Env:SHIXU_STOREPASS }
}
if (-not (Test-Path -LiteralPath $propertiesPath)) { throw 'Signing password is missing. Restore keystore.properties.' }
[System.IO.File]::WriteAllText((Join-Path $workspace 'android\local.properties'), ('sdk.dir=' + $SdkRoot.Replace('\','/') + "`n"), [System.Text.UTF8Encoding]::new($false))
$tasks = @('assembleRelease')
if ($IncludeDebug) { $tasks += 'assembleDebug' }
Push-Location (Join-Path $workspace 'android')
try {
    & '.\gradlew.bat' --no-daemon --console=plain @tasks
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
} finally { Pop-Location }
$releaseDirectory = Join-Path $workspace 'release\android'
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $workspace 'android\app\build\outputs\apk\release\app-release.apk') -Destination (Join-Path $releaseDirectory 'shixu-0.1.0-android.apk') -Force
$apkPath = Join-Path $releaseDirectory 'shixu-0.1.0-android.apk'
$stream = [System.IO.File]::OpenRead($apkPath)
$sha = [System.Security.Cryptography.SHA256]::Create()
try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
finally { $stream.Dispose(); $sha.Dispose() }
[System.IO.File]::WriteAllText((Join-Path $releaseDirectory 'SHA256SUMS.txt'), ($hash + '  shixu-0.1.0-android.apk' + "`n"), [System.Text.UTF8Encoding]::new($false))
Write-Output ('APK: ' + $apkPath)
Write-Output ('SHA256: ' + $hash)
