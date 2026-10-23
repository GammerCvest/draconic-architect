const images = new Map<string, HTMLImageElement>();
const tinted = new Map<string, HTMLCanvasElement>();
const listeners = new Set<() => void>();

export function onImageLoad(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function image(src: string | null): HTMLImageElement | null {
  if (!src) return null;
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.onload = () => listeners.forEach((fn) => fn());
    img.src = src;
    images.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

// brightness turns into transparency: dark lines become ink, white becomes paper
export function tintedImage(src: string, color: string): HTMLCanvasElement | null {
  const img = image(src);
  if (!img) return null;
  const key = `${color}|${src}`;
  let out = tinted.get(key);
  if (out) return out;
  out = document.createElement("canvas");
  out.width = img.naturalWidth;
  out.height = img.naturalHeight;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, out.width, out.height);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
    px[i + 3] = Math.round(px[i + 3] * (1 - lum));
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
  ctx.putImageData(data, 0, 0);
  tinted.set(key, out);
  return out;
}
