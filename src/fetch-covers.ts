// Pages /api/plays for every play's album cover, then downloads each cover
// once from Spotify's image CDN (no Web API calls, so no quota cost).
import { mkdirSync, writeFileSync } from "node:fs";
import { type CoverPlay, downloadCovers, get, smallCover } from "./covers.ts";
import { base, token } from "./mw.ts";
const headers = { authorization: `Bearer ${token}` };

type ApiPlay = { played_at_ms: number; artists: string | null; album_name: string | null; image_url: string | null };

const plays: CoverPlay[] = [];
let before: string | null = "";
while (before !== null) {
  const q = before ? `&before=${encodeURIComponent(before)}` : "";
  const page = (await (await get(`${base}/api/plays?limit=500${q}`, headers)).json()) as {
    plays: ApiPlay[];
    next_before: string | null;
  };
  for (const p of page.plays) {
    plays.push({
      ms: p.played_at_ms,
      artist: p.artists?.split(", ")[0] ?? "Unknown",
      album: p.album_name,
      cover: p.image_url ? smallCover(p.image_url.split("/").pop()!) : null,
    });
  }
  before = page.next_before;
  process.stdout.write(`\r${plays.length} plays`);
}
mkdirSync("data", { recursive: true });
writeFileSync("data/plays.json", JSON.stringify(plays));
console.log();
await downloadCovers(plays);
