// Downloads the whole play history from a music-warehouse Worker as CSV.
// MW_URL and MW_TOKEN are read in src/mw.ts.
import { mkdirSync, writeFileSync } from "node:fs";
import { config } from "./config.ts";
import { base, token } from "./mw.ts";

const res = await fetch(`${base}/api/plays.csv`, {
  headers: { authorization: `Bearer ${token}`, "user-agent": "Mozilla/5.0 listening-poster" },
});
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);

mkdirSync("data", { recursive: true });
const body = await res.text();
writeFileSync(config.csv, body);
console.log(`${body.split("\n").length - 2} plays -> ${config.csv}`);
