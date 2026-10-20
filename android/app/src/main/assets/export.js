(() => {
  let port;
  const waiting = new Map();
  // Retain the original Blob until the page revokes its object URL. Reading it
  // directly also respects the site's CSP, which intentionally blocks blob fetches.
  if (!window.__shixuExportBlobs) {
    const blobs = window.__shixuExportBlobs = new Map();
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); blobs.set(url, blob); return url; };
    URL.revokeObjectURL = url => { blobs.delete(url); revoke(url); };
  }
  window.addEventListener('message', event => {
    if (port || event.data !== 'shixu-export-channel:__SHIXU_CHANNEL_TOKEN__' || event.ports.length !== 1) return;
    port = event.ports[0];
    port.onmessage = event => {
      const reply = JSON.parse(event.data), key = `${reply.token}:${reply.seq}`;
      const pending = waiting.get(key); if (!pending) return;
      waiting.delete(key); clearTimeout(pending.timeout);
      reply.error ? pending.reject(new Error(reply.error)) : pending.resolve();
    };
  });
  const send = message => new Promise((resolve, reject) => {
    const key = `${message.token}:${message.seq}`;
    const timeout = setTimeout(() => { waiting.delete(key); reject(new Error('备份传输超时，请重试。')); }, 15000);
    waiting.set(key, { resolve, reject, timeout }); port.postMessage(JSON.stringify(message));
  });
  const base64 = blob => new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = reject;
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
  window.__shixuExport = async (token, url) => {
    if (!port) return false;
    try {
      const blob = window.__shixuExportBlobs.get(url);
      if (!blob) throw new Error('备份内容已过期，请重新导出。');
      if (blob.size > 64 * 1024 * 1024) throw new Error('备份超过 64 MB，请在电脑端导出。');
      await send({ type: 'start', token, seq: 0, size: blob.size });
      let seq = 1;
      for (let offset = 0; offset < blob.size; offset += 49152) {
        await send({ type: 'chunk', token, seq: seq++, data: await base64(blob.slice(offset, offset + 49152)) });
      }
      await send({ type: 'end', token, seq });
    } catch (error) { port.postMessage(JSON.stringify({ type: 'error', token, message: error.message })); }
    return true;
  };
})();
