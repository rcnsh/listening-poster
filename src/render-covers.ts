// Draws every play as its album cover, in order, as one mosaic read left to
// right. Reads data/plays.json and data/covers/ from `pnpm fetch:covers`.
import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { grain, save, vignette } from "./backdrop.ts";
import { config } from "./config.ts";
import type { CoverPlay } from "./fetch-covers.ts";
import { wallClock } from "./time.ts";

const { width: W, height: H, gap, radius, blank, paper } = config.covers;

const start = Date.parse(`${config.start}T00:00:00Z`);
const plays = (JSON.parse(readFileSync("data/plays.json", "utf8")) as CoverPlay[])
  .filter((p) => wallClock(p.ms) >= start)
  .sort((a, b) => a.ms - b.ms);

const covers = new Map<string, Image>();
for (const id of new Set(plays.map((p) => p.cover))) {
  if (id && existsSync(`data/covers/${id}.jpg`)) covers.set(id, await loadImage(`data/covers/${id}.jpg`));
}

// ---- layout -------------------------------------------------------------

// Biggest tile that fits inside the margins, then centre the block.
const margin = Math.round(W * 0.09);
let pitch = 200, cols = 0, rows = 0;
for (; pitch > 4; pitch--) {
  cols = Math.floor((W - 2 * margin + gap) / pitch);
  rows = Math.ceil(plays.length / cols);
  if (rows * pitch - gap <= H - 2 * margin) break;
}
const tile = pitch - gap;
const blockW = cols * pitch - gap, blockH = rows * pitch - gap;
const bx = Math.round((W - blockW) / 2), by = Math.round((H - blockH) / 2);

// ---- mosaic -------------------------------------------------------------

const art = createCanvas(blockW, blockH);
const a = art.getContext("2d");
a.imageSmoothingQuality = "high";
plays.forEach((p, i) => {
  const x = (i % cols) * pitch, y = Math.floor(i / cols) * pitch;
  a.save();
  a.beginPath();
  a.roundRect(x, y, tile, tile, radius);
  a.clip();
  const img = p.cover ? covers.get(p.cover) : undefined;
  if (img) a.drawImage(img, x, y, tile, tile);
  else {
    a.fillStyle = blank;
    a.fill();
  }
  a.restore();
});

// ---- page ---------------------------------------------------------------

const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");
// Warm paper, with the mosaic floating on a soft shadow.
const bg = ctx.createLinearGradient(0, 0, 0, H);
bg.addColorStop(0, paper[0]);
bg.addColorStop(1, paper[1]);
ctx.fillStyle = bg;
ctx.fillRect(0, 0, W, H);
vignette(ctx, 0.12);

ctx.save();
ctx.shadowColor = "rgba(30, 20, 10, 0.35)";
ctx.shadowBlur = 140;
ctx.shadowOffsetY = 50;
ctx.fillStyle = "#15151a";
// Full rows, then only as much of the last row as it fills.
const lastRow = plays.length - (rows - 1) * cols;
ctx.beginPath();
ctx.rect(bx, by, blockW, (rows - 1) * pitch);
ctx.rect(bx, by + (rows - 1) * pitch - gap, lastRow * pitch - gap, tile + gap);
ctx.fill();
ctx.restore();
ctx.drawImage(art, bx, by);
grain(ctx, 0.07);

mkdirSync("out", { recursive: true });
await save(canvas, config.covers.out, config.covers.preview, 1240);
console.log(`${plays.length} plays, ${tile}px tiles, ${cols} x ${rows} -> ${config.covers.out}`);
