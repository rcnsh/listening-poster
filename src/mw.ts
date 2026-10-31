// The music-warehouse connection, used only by the fetchers, so the Keychain
// lookup never runs on the export path. MW_URL defaults to Jacob's deployment.
import { execFileSync } from "node:child_process";

export const base = process.env.MW_URL ?? "https://music-api.rcn.sh";
export const token = process.env.MW_TOKEN ?? keychain();

function keychain() {
  try {
    return execFileSync("security", ["find-generic-password", "-s", "music-warehouse-mcp", "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    console.error("Set MW_TOKEN to a music-warehouse read token (no macOS Keychain entry music-warehouse-mcp found).");
    process.exit(1);
  }
}
