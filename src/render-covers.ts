// Draws every play as its album cover, in order, one band per year, with the
// year's most-played album shown large beside it. Reads data/plays.json and
// data/covers/ from `pnpm fetch:covers`.
import { createCanvas, GlobalFonts, loadImage, type Image } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "./config.ts";
import type { CoverPlay } from "./fetch-covers.ts";
import { wallClock } from "./time.ts";

const { width: W, height: H, gap, blank } = config.covers;

if (!GlobalFonts.has(config.font)) console.warn(`font "${config.font}" not found, using default`);
const font = (size: number, weight = 500) => `${weight} ${size}px "${config.font}"`;
const n = (x: number) => x.toLocaleString("en-GB");

// ---- data ---------------------------------------------------------------

type Play = CoverPlay & { local: Date };
const start = Date.parse(`${config.start}T00:00:00Z`);
const plays: Play[] = (JSON.parse(readFileSync("data/plays.json", "utf8")) as CoverPlay[])
  .map((p) => ({ ...p, local: new Date(wallClock(p.ms)) }))
  .filter((p) => p.local.getTime() >= start)
  .sort((a, b) => a.ms - b.ms);

const covers = new Map<string, Image>();
for (const id of new Set(plays.map((p) => p.cover))) {
  if (id && existsSync(`data/covers/${id}.jpg`)) covers.set(id, await loadImage(`data/covers/${id}.jpg`));
}

type Year = { year: number; plays: Play[]; top?: { cover: string; album: string; artist: string; count: number } };
const years: Year[] = [];
for (const p of plays) {
  const y = p.local.getUTCFullYear();
  if (years.at(-1)?.year !== y) years.push({ year: y, plays: [] });
  years.at(-1)!.plays.push(p);
}
for (const y of years) {
  const count = new Map<string, number>();
  for (const p of y.plays) if (p.cover && covers.has(p.cover)) count.set(p.cover, (count.get(p.cover) ?? 0) + 1);
  const [cover, c] = [...count].sort((a, b) => b[1] - a[1])[0] ?? [];
  const p = y.plays.find((q) => q.cover === cover);
  if (cover && p) y.top = { cover, album: p.album ?? "", artist: p.artist, count: c };
}

// The year's top album large: the 640 px rendition of the same image.
async function largeCover(id: string) {
  const big = id.replace(/^ab67616d00004851/, "ab67616d0000b273");
  const path = `data/covers/large-${big}.jpg`;
  if (!existsSync(path)) {
    const res = await fetch(`https://i.scdn.co/image/${big}`);
    if (!res.ok) return covers.get(id)!;
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  return loadImage(path);
}

// ---- layout -------------------------------------------------------------

const margin = 360;
const labelW = 1000;
const mx0 = margin + labelW + 80, mx1 = W - margin;
const top = 1000, bottom = H - 420;
const bandGap = 110;

// Biggest tile that fits every year's band in the space.
let pitch = 120, cols = 0;
for (; pitch > 4; pitch--) {
  cols = Math.floor((mx1 - mx0 + gap) / pitch);
  const rows = years.reduce((s, y) => s + Math.ceil(y.plays.length / cols), 0);
  if (rows * pitch + bandGap * (years.length - 1) <= bottom - top) break;
}
const tile = pitch - gap;

const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingQuality = "high";
ctx.fillStyle = config.background;
ctx.fillRect(0, 0, W, H);

// Title
const last = plays.at(-1)!.local;
ctx.fillStyle = config.ink;
ctx.font = font(200, 700);
ctx.fillText(config.covers.title, margin, 560);
ctx.fillStyle = config.muted;
ctx.font = font(66);
ctx.fillText(
  `${n(plays.length)} plays from ${years[0].year} to ${last.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}, in order, one cover each. Rows run left to right.`,
  margin + 6, 690,
);

let y = top;
for (const year of years) {
  const rows = Math.ceil(year.plays.length / cols);
  const bandH = rows * pitch - gap;

  // Label column
  ctx.textAlign = "left";
  ctx.fillStyle = config.ink;
  ctx.font = font(170, 700);
  ctx.fillText(String(year.year), margin, y + 140);
  ctx.fillStyle = config.muted;
  ctx.font = font(54);
  ctx.fillText(`${n(year.plays.length)} plays`, margin + 6, y + 225);
  if (year.top) {
    const size = Math.min(labelW - 120, bandH - 420);
    if (size > 160) {
      const img = await largeCover(year.top.cover);
      ctx.drawImage(img, margin, y + 280, size, size);
      ctx.fillStyle = config.ink;
      ctx.font = font(44, 600);
      ctx.fillText(fit(year.top.album, labelW - 60), margin, y + 280 + size + 64);
      ctx.fillStyle = config.muted;
      ctx.font = font(38);
      ctx.fillText(fit(`${year.top.artist}, ${n(year.top.count)} plays`, labelW - 60), margin, y + 280 + size + 116);
    }
  }

  // Mosaic, with each month's first row marked on the right
  let month = -1, labelY = -Infinity;
  year.plays.forEach((p, i) => {
    const x = mx0 + (i % cols) * pitch;
    const ty = y + Math.floor(i / cols) * pitch;
    const img = p.cover ? covers.get(p.cover) : undefined;
    if (img) ctx.drawImage(img, x, ty, tile, tile);
    else {
      ctx.fillStyle = blank;
      ctx.fillRect(x, ty, tile, tile);
    }
    const m = p.local.getUTCMonth();
    if (m === month) return;
    month = m;
    // Skip a label that would overlap the previous one (a quiet month).
    if (ty + tile - labelY >= 40) {
      labelY = ty + tile;
      ctx.fillStyle = config.muted;
      ctx.font = font(30);
      ctx.fillText(p.local.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }), mx1 + 30, ty + tile);
    }
  });
  y += bandH + gap + bandGap;
}

function fit(text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  while (text.length > 1 && ctx.measureText(`${text}…`).width > max) text = text.slice(0, -1);
  return `${text.trimEnd()}…`;
}

const blanks = plays.filter((p) => !p.cover || !covers.has(p.cover)).length;
ctx.fillStyle = config.muted;
ctx.font = font(40);
ctx.textAlign = "left";
ctx.fillText(`${n(covers.size)} different covers. ${n(blanks)} plays have no cover stored and are blank.`, margin, H - 220);
ctx.textAlign = "right";
ctx.fillText(`${config.author} · music-warehouse`, mx1, H - 220);

// ---- output -------------------------------------------------------------

mkdirSync("out", { recursive: true });
writeFileSync(config.covers.out, await canvas.encode("png"));
const pw = 1240;
const preview = createCanvas(pw, Math.round((H * pw) / W));
const pctx = preview.getContext("2d");
pctx.imageSmoothingQuality = "high";
pctx.drawImage(canvas, 0, 0, preview.width, preview.height);
writeFileSync(config.covers.preview, await preview.encode("png"));
console.log(`${plays.length} plays, ${tile}px tiles, ${cols} per row -> ${config.covers.out}`);
