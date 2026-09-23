// Limit simultaneous lossless conversions; no browser-persistent storage.
let count = 0;
const listeners = new Set<() => void>();
export const pendingImages = () => count;
export const subscribeImages = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function changeCount(delta: number) { count += delta; listeners.forEach(listener => listener()); }
let queue: Promise<unknown> = Promise.resolve();
export function readUploadImage(file: File): Promise<string> {
  changeCount(1);
  const job = queue.then(async () => {
    let image: Blob = file;
    try {
      const response = await fetch('/api/images/optimize',{method:'POST',headers:{'Content-Type':file.type},body:file});
      if (response.ok && response.status !== 204) {
        const smaller = await response.blob();
        if (smaller.type.startsWith('image/') && smaller.size > 0 && smaller.size < file.size) image = smaller;
      }
    } catch { /* Compression failure must not prevent uploading the original. */ }
    return new Promise<string>((resolve,reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('사진을 읽지 못했습니다. 다시 선택해 주세요.'));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(image);
    });
  });
  queue = job.catch(() => {});
  return job.finally(() => changeCount(-1));
}
