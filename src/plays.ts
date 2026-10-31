// Reading data/plays.csv, shared by the renderers that draw from it.
import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import { config } from "./config.ts";
import { wallClock } from "./time.ts";

const DAY = 86_400_000;

export type Row = { played_at: string; artists: string; source?: string };

// music-warehouse joins a track's artists with ", " (its own "export" rows
// too); a row from pnpm import:spotify holds one album artist, which may
// itself contain ", " (Tyler, The Creator).
export const primaryArtist = (r: Row) =>
  !r.artists ? "Unknown" : r.source === "spotify-export" ? r.artists : r.artists.split(", ")[0];

// Every play from config.start on (or from the first play's day), as local
// wall-clock time (see time.ts), oldest first. Exits when there are none.
export function readPlays() {
  const rows: Row[] = parse(readFileSync(config.csv), { columns: true });
  const plays = rows.map((r) => ({ t: wallClock(Date.parse(r.played_at)), artist: primaryArtist(r) }));
  const start = config.start
    ? Date.parse(`${config.start}T00:00:00Z`)
    : Math.floor(plays.reduce((a, p) => Math.min(a, p.t), Infinity) / DAY) * DAY;
  const kept = plays.filter((p) => p.t >= start).sort((a, b) => a.t - b.t);
  if (!kept.length) {
    console.error(`No plays in ${config.csv}${config.start ? ` from ${config.start}` : ""}. Run pnpm import:spotify or pnpm fetch first.`);
    process.exit(1);
  }
  return { plays: kept, start };
}
