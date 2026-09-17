import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const unknown = [...args].filter(arg => arg !== "--sync");
if (unknown.length) throw new Error(`Unsupported argument: ${unknown.join(", ")}`);

run("update-board-from-git.mjs", ["--write"]);
run("render-board.mjs");
run("sync-trello.mjs", args.has("--sync") ? ["--sync"] : []);

function run(script, scriptArgs = []) {
  const scriptPath = fileURLToPath(new URL(script, import.meta.url));
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
