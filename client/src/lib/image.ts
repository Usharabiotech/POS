/**
 * Shrink + compress a picked image entirely in the browser to a small square-ish
 * thumbnail data URI, so product photos cost almost nothing to store in the cloud.
 * Downscales to `maxDim` px and steps quality down until it fits `maxBytes`.
 */
export async function compressImage(file: File, maxDim = 320, maxBytes = 45000): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Not an image"));
    i.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0, w, h);

  // Step quality down until under the size budget (JPEG — small + universally supported).
  let quality = 0.72;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > maxBytes && quality > 0.3) {
    quality -= 0.12;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  return out;
}
