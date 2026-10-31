// Draws every play as one dot: across is the date, down is the local time of
// day, colour is the primary artist. Writes a print PNG and a small preview.
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { parse } from "csv-parse/sync";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "./config.ts";
import { wallClock } from "./time.ts";

const DAY = 86_400_000;
const { width: W, height: H } = config;

if (!GlobalFonts.has(config.font)) console.warn(`font "${config.font}" not found, using default`);
const font = (size: number, weight = 500) => `${weight} ${size}px "${config.font}"`;

// ---- data ---------------------------------------------------------------

type Row = { played_at: string; artists: string; source?: string };
type Play = { day: number; minute: number; artist: string };

const rows: Row[] = parse(readFileSync(config.csv), { columns: true });
const local = rows.map((r) => wallClock(Date.parse(r.played_at)));
const start = config.start
  ? Date.parse(`${config.start}T00:00:00Z`)
  : Math.floor(local.reduce((a, b) => Math.min(a, b)) / DAY) * DAY;
const plays: Play[] = [];
for (const [i, r] of rows.entries()) {
  const t = local[i] - start;
  if (t < 0) continue;
  plays.push({
    day: Math.floor(t / DAY),
    minute: (t % DAY) / 60_000,
    // music-warehouse joins a track's artists with ", "; an export row holds
    // one album artist, which may itself contain ", " (Tyler, The Creator).
    artist: !r.artists ? "Unknown" : r.source === "export" ? r.artists : r.artists.split(", ")[0],
  });
}
plays.sort((a, b) => a.day - b.day || a.minute - b.minute);
const days = plays.at(-1)!.day + 1;

const counts = new Map<string, number>();
for (const p of plays) counts.set(p.artist, (counts.get(p.artist) ?? 0) + 1);
const ranked = [...counts].sort((a, b) => b[1] - a[1]);
const colourOf = new Map(ranked.slice(0, config.colours.length).map(([a], i) => [a, config.colours[i]]));

// ---- layout -------------------------------------------------------------

const x0 = 400, x1 = W - 300, y0 = 760, y1 = H - 1020;
const dayW = (x1 - x0) / days;
const xOf = (day: number) => x0 + (day + 0.5) * dayW;
const yOf = (minute: number) => y0 + (minute / 1440) * (y1 - y0);
const dateOf = (day: number) => new Date(start + day * DAY);
const dayOf = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - start) / DAY);

const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");
ctx.fillStyle = config.background;
ctx.fillRect(0, 0, W, H);

// Title
ctx.textBaseline = "alphabetic";
ctx.fillStyle = config.ink;
ctx.font = font(190, 700);
ctx.fillText(config.title, x0, 420);
ctx.fillStyle = config.muted;
ctx.font = font(64);
const first = dateOf(0).getUTCFullYear();
const last = dateOf(days - 1);
ctx.fillText(
  `${plays.length.toLocaleString("en-GB")} plays, ${first} to ${last.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}. One dot per play: across is the date, down is the time of day where I was.`,
  x0 + 6, 540,
);

// Hour grid
ctx.font = font(46);
ctx.textAlign = "right";
ctx.textBaseline = "middle";
for (let h = 0; h <= 24; h += 3) {
  const y = yOf(h * 60);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  const hour = (h + config.dayStartsAt) % 24;
  const label = hour === 0 ? "midnight" : hour === 12 ? "noon" : `${hour % 12} ${hour < 12 ? "am" : "pm"}`;
  ctx.fillStyle = config.muted;
  ctx.fillText(label, x0 - 40, y);
}

// Year grid, with each year's most-played artist underneath
ctx.textAlign = "left";
ctx.textBaseline = "alphabetic";
for (let y = first; y <= last.getUTCFullYear(); y++) {
  const from = Math.max(0, dayOf(`${y}-01-01`));
  const to = Math.min(days, dayOf(`${y + 1}-01-01`));
  const x = x0 + from * dayW;
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y0 - 30); ctx.lineTo(x, y1 + 30); ctx.stroke();

  const year = new Map<string, number>();
  for (const p of plays) if (p.day >= from && p.day < to) year.set(p.artist, (year.get(p.artist) ?? 0) + 1);
  const [top] = [...year].sort((a, b) => b[1] - a[1]);
  ctx.fillStyle = config.ink;
  ctx.font = font(96, 700);
  ctx.fillText(String(y), x + 24, y1 + 150);
  if (top) {
    ctx.fillStyle = colourOf.get(top[0]) ?? config.muted;
    ctx.font = font(48, 600);
    ctx.fillText(top[0], x + 28, y1 + 225);
  }
}

// Time zone changes
for (const z of config.timezones) {
  const d = dayOf(z.from);
  if (d <= 0 || d >= days) continue;
  const x = x0 + d * dayW;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  ctx.beginPath(); ctx.moveTo(x, y0 - 70); ctx.lineTo(x, y1); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = config.ink;
  ctx.font = font(42, 600);
  ctx.textAlign = "right";
  ctx.fillText(`${z.tz.split("/").at(-1)!.replaceAll("_", " ")} →`, x - 16, y0 - 50);
  ctx.textAlign = "left";
}

// Dots: grey first so colour sits on top
const r = Math.max(3, dayW * 1.45);
const dot = (p: Play) => {
  ctx.beginPath();
  ctx.arc(xOf(p.day), yOf(p.minute), r, 0, Math.PI * 2);
  ctx.fill();
};
ctx.fillStyle = config.other;
for (const p of plays) if (!colourOf.has(p.artist)) dot(p);
ctx.globalAlpha = 0.85;
for (const p of plays) {
  const c = colourOf.get(p.artist);
  if (!c) continue;
  ctx.fillStyle = c;
  dot(p);
}
ctx.globalAlpha = 1;

// Legend
const cols = 6;
const colW = (x1 - x0) / cols;
const legendY = H - 560;
ranked.slice(0, config.colours.length).forEach(([artist, n], i) => {
  const x = x0 + (i % cols) * colW;
  const y = legendY + Math.floor(i / cols) * 130;
  ctx.fillStyle = config.colours[i];
  ctx.beginPath(); ctx.arc(x + 22, y - 18, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = config.ink;
  ctx.font = font(50, 600);
  ctx.fillText(artist, x + 66, y);
  ctx.fillStyle = config.muted;
  ctx.font = font(38);
  ctx.fillText(`${n.toLocaleString("en-GB")} plays`, x + 66, y + 48);
});
const shown = ranked.slice(0, config.colours.length).reduce((s, [, n]) => s + n, 0);
ctx.fillStyle = config.muted;
ctx.font = font(40);
ctx.fillText(
  `Grey: ${(ranked.length - config.colours.length).toLocaleString("en-GB")} other artists, ${(plays.length - shown).toLocaleString("en-GB")} plays.`,
  x0, H - 200,
);
ctx.textAlign = "right";
ctx.fillText(config.footer, x1, H - 200);

// ---- output -------------------------------------------------------------

mkdirSync("out", { recursive: true });
writeFileSync(config.out, await canvas.encode("png"));
const pw = 1754;
const preview = createCanvas(pw, Math.round((H * pw) / W));
preview.getContext("2d").drawImage(canvas, 0, 0, preview.width, preview.height);
writeFileSync(config.preview, await preview.encode("png"));
console.log(`${plays.length} plays over ${days} days -> ${config.out}, ${config.preview}`);
