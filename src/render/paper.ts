import { mulberry32 } from "../rng";

const SIZE = 256;

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  return [c, c.getContext("2d")!];
}

export function makePaperTile(color: string): HTMLCanvasElement {
  const [c, ctx] = canvas();
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const rnd = mulberry32(7);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n - 1;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function makeGrainTile(): HTMLCanvasElement {
  const [c, ctx] = canvas();
  const img = ctx.createImageData(SIZE, SIZE);
  const rnd = mulberry32(11);
  for (let i = 0; i < img.data.length; i += 4) {
    const r = rnd();
    img.data[i + 3] = r > 0.55 ? Math.floor((r - 0.55) * 380) : 0;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
