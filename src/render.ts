// Draws every play as one dot: across is the date, down is the local time of
// day, colour is the primary artist. Writes a print PNG and a small preview.
import { createCanvas } from "@napi-rs/canvas";
import { parse } from "csv-parse/sync";
import { mkdirSync, readFileSync } from "node:fs";
import { grain, save, vignette } from "./backdrop.ts";
import { config } from "./config.ts";
import { wallClock } from "./time.ts";

const DAY = 86_400_000;
const { width: W, height: H, colours, other, background } = config.dots;

// ---- data ---------------------------------------------------------------

type Row = { played_at: string; artists: string };
type Play = { day: number; minute: number; artist: string };

const start = Date.parse(`${config.start}T00:00:00Z`);
const rows: Row[] = parse(readFileSync(config.csv), { columns: true });
const plays: Play[] = [];
for (const r of rows) {
  const t = wallClock(Date.parse(r.played_at)) - start;
  if (t < 0) continue;
  plays.push({
    day: Math.floor(t / DAY),
    minute: (t % DAY) / 60_000,
    artist: r.artists ? r.artists.split(", ")[0] : "Unknown",
  });
}
plays.sort((a, b) => a.day - b.day || a.minute - b.minute);
const days = plays.at(-1)!.day + 1;

const counts = new Map<string, number>();
for (const p of plays) counts.set(p.artist, (counts.get(p.artist) ?? 0) + 1);
const ranked = [...counts].sort((a, b) => b[1] - a[1]);
const colourOf = new Map(ranked.slice(0, colours.length).map(([a], i) => [a, colours[i]]));

// ---- dots ---------------------------------------------------------------

const margin = Math.round(H * 0.11);
const x0 = margin, x1 = W - margin, y0 = margin, y1 = H - margin;
const dayW = (x1 - x0) / days;
const r = Math.max(3, dayW * 1.45);

const art = createCanvas(W, H);
const a = art.getContext("2d");
const dot = (p: Play) => {
  a.beginPath();
  a.arc(x0 + (p.day + 0.5) * dayW, y0 + (p.minute / 1440) * (y1 - y0), r, 0, Math.PI * 2);
  a.fill();
};
// Grey first so colour sits on top.
a.fillStyle = other;
for (const p of plays) if (!colourOf.has(p.artist)) dot(p);
a.globalAlpha = 0.9;
for (const p of plays) {
  const c = colourOf.get(p.artist);
  if (!c) continue;
  a.fillStyle = c;
  dot(p);
}

// ---- page ---------------------------------------------------------------

const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");
const bg = ctx.createLinearGradient(0, 0, W, H);
bg.addColorStop(0, background[0]);
bg.addColorStop(1, background[1]);
ctx.fillStyle = bg;
ctx.fillRect(0, 0, W, H);

// An aurora behind the dots: each stretch of time glows in the average colour
// of the artists that dominated it.
const bin = 30;
const glows: { r: number; g: number; b: number; n: number }[] = [];
for (const p of plays) {
  const c = colourOf.get(p.artist);
  if (!c) continue;
  const g = (glows[Math.floor(p.day / bin)] ??= { r: 0, g: 0, b: 0, n: 0 });
  g.r += parseInt(c.slice(1, 3), 16);
  g.g += parseInt(c.slice(3, 5), 16);
  g.b += parseInt(c.slice(5, 7), 16);
  g.n++;
}
const most = Math.max(...Array.from(glows, (g) => g?.n ?? 0));
ctx.save();
ctx.globalCompositeOperation = "screen";
glows.forEach((g, i) => {
  if (!g) return;
  const x = x0 + (i + 0.5) * bin * dayW;
  const y = (y0 + y1) / 2;
  const rad = H * 0.42;
  const alpha = 0.055 * (g.n / most) ** 0.6;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
  const rgb = `${Math.round(g.r / g.n)}, ${Math.round(g.g / g.n)}, ${Math.round(g.b / g.n)}`;
  grad.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
});
ctx.restore();
vignette(ctx, 0.6);

// A soft glow under the dots, then the dots themselves.
ctx.save();
ctx.globalCompositeOperation = "screen";
ctx.filter = "blur(14px)";
ctx.globalAlpha = 0.6;
ctx.drawImage(art, 0, 0);
ctx.restore();
ctx.drawImage(art, 0, 0);
grain(ctx, 0.05);

mkdirSync("out", { recursive: true });
await save(canvas, config.dots.out, config.dots.preview, 1754);
console.log(`${plays.length} plays over ${days} days -> ${config.dots.out}`);
