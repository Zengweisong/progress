export const MAX_IMAGE_DATA = 400000;
export const MAX_NOTE_IMAGE_DATA = 2 * 1024 * 1024;
export function validImageData(value) {
  return typeof value === 'string' && value.length <= MAX_IMAGE_DATA && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
export function imageSource(url, attachments = []) {
  if (url.startsWith('attachment:')) {
    const asset = attachments.find(item => item.id === url.slice(11));
    return asset && validImageData(asset.data) ? asset.data : '';
  }
  return /^https:\/\//i.test(url) || validImageData(url) ? url : '';
}
export function portableMarkdown(body, attachments = []) {
  return body.replace(/(!\[[^\[\]\n]*\]\()attachment:([\w-]+)(\))/g, (match, before, id, after) => {
    const source = imageSource(`attachment:${id}`, attachments);
    return source ? before + source + after : match;
  });
}
export async function readNoteImage(file) {
  if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type) || file.size > 10 * 1024 * 1024) throw new Error('请选择 10 MB 以内的 PNG、JPEG、WebP、GIF 或 AVIF 图片。');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('图片无法读取，请换一张图片。'); }
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL('image/webp', .86);
    for (let attempt = 0; data.length > MAX_IMAGE_DATA && attempt < 6; attempt++) {
      const next = document.createElement('canvas'); next.width = Math.max(1, Math.round(canvas.width * .75)); next.height = Math.max(1, Math.round(canvas.height * .75));
      next.getContext('2d').drawImage(canvas, 0, 0, next.width, next.height);
      canvas.width = next.width; canvas.height = next.height; context.drawImage(next, 0, 0);
      data = canvas.toDataURL('image/webp', .8);
    }
    if (!validImageData(data)) throw new Error('这张图片压缩后仍然过大，请选择尺寸更小的图片。');
    return { id: crypto.randomUUID(), name: file.name.slice(0, 200) || '图片', mime: data.slice(5, data.indexOf(';')), data };
  } finally { bitmap.close(); }
}
