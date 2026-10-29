// Downloads the whole play history from a music-warehouse Worker as CSV.
// MW_URL defaults to Jacob's deployment; the token comes from MW_TOKEN or the
// macOS Keychain entry the music-warehouse MCP server uses.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { config } from "./config.ts";

const base = process.env.MW_URL ?? "https://music-api.rcn.sh";
const token =
  process.env.MW_TOKEN ??
  execFileSync("security", ["find-generic-password", "-s", "music-warehouse-mcp", "-w"], {
    encoding: "utf8",
  }).trim();

const res = await fetch(`${base}/api/plays.csv`, {
  headers: { authorization: `Bearer ${token}`, "user-agent": "Mozilla/5.0 listening-poster" },
});
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);

mkdirSync("data", { recursive: true });
const body = await res.text();
writeFileSync(config.csv, body);
console.log(`${body.split("\n").length - 2} plays -> ${config.csv}`);
