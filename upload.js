// Logo upload: shrinks the picked image in the browser (max 512 px, WebP/PNG), sends it to
// /api/upload (Vercel KV) and returns an absolute URL usable as an on-chain logo.
const MAX_SIDE = 512;

async function shrink(file) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Use a PNG, JPG, WEBP or GIF image");
  if (file.type === "image/gif" && file.size <= 480 * 1024) return file; // keep small GIFs animated
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  for (const [type, q] of [["image/webp", 0.9], ["image/webp", 0.75], ["image/png", undefined]]) {
    const blob = await new Promise((r) => canvas.toBlob(r, type, q));
    if (blob && blob.type === type && blob.size <= 480 * 1024) return blob;
  }
  throw new Error("Image is too large even after resizing");
}

export async function uploadLogo(file) {
  const blob = await shrink(file);
  const b64 = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("Could not read the image"));
    r.readAsDataURL(blob);
  });
  const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: b64 }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Upload failed (${res.status})`);
  return new URL(json.path, location.origin).href;
}
