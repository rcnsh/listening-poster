import { createCanvas, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";

export function vignette(ctx: SKRSContext2D, strength: number) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// Fine film grain from a tiled noise pattern, seeded so renders repeat.
export function grain(ctx: SKRSContext2D, alpha: number) {
  const size = 512;
  const tile = createCanvas(size, size);
  const t = tile.getContext("2d");
  const img = t.createImageData(size, size);
  let seed = 7;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
    const v = seed & 0xff;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  t.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = ctx.createPattern(tile, "repeat")!;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

export async function save(canvas: Canvas, out: string, preview: string, previewWidth: number) {
  writeFileSync(out, await canvas.encode("png"));
  const p = createCanvas(previewWidth, Math.round((canvas.height * previewWidth) / canvas.width));
  const pctx = p.getContext("2d");
  pctx.imageSmoothingQuality = "high";
  pctx.drawImage(canvas, 0, 0, p.width, p.height);
  writeFileSync(preview, await p.encode("png"));
}
