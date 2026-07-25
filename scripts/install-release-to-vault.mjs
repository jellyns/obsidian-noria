import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const releaseAssets = ["manifest.json", "main.js", "styles.css"];
const preservedInstallFiles = new Set([...releaseAssets, "data.json"]);

const args = process.argv.slice(2);
const keepExtra = args.includes("--keep-extra");
const vaultArg = args.find((arg) => arg !== "--clean" && arg !== "--keep-extra")
  || process.env.NORIA_VAULT;

function fail(message) {
  console.error(`Noria install failed: ${message}`);
  process.exit(1);
}

if (!vaultArg) {
  fail("pass a vault path, for example: npm run install:vault -- F:/NoriaTest");
}

const vaultRoot = path.resolve(vaultArg);
const obsidianDir = path.join(vaultRoot, ".obsidian");
const targetRoot = path.join(obsidianDir, "plugins", "noria");

if (!fs.existsSync(vaultRoot) || !fs.statSync(vaultRoot).isDirectory()) {
  fail(`vault path does not exist: ${vaultRoot}`);
}

if (path.basename(targetRoot) !== "noria" || path.basename(path.dirname(targetRoot)) !== "plugins") {
  fail(`refusing unexpected install target: ${targetRoot}`);
}

if (fs.existsSync(targetRoot)) {
  const targetStat = fs.lstatSync(targetRoot);
  if (targetStat.isSymbolicLink()) {
    fail(`refusing symbolic link or junction install target: ${targetRoot}`);
  }
  if (!targetStat.isDirectory()) {
    fail(`install target is not a directory: ${targetRoot}`);
  }
}

for (const asset of releaseAssets) {
  const source = path.join(repoRoot, asset);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    fail(`missing release asset, run npm run build first: ${asset}`);
  }
}

fs.mkdirSync(targetRoot, { recursive: true });

if (!keepExtra) {
  for (const entry of fs.readdirSync(targetRoot, { withFileTypes: true })) {
    if (preservedInstallFiles.has(entry.name)) continue;
    fs.rmSync(path.join(targetRoot, entry.name), { recursive: true, force: true });
  }
}

for (const asset of releaseAssets) {
  fs.copyFileSync(path.join(repoRoot, asset), path.join(targetRoot, asset));
}

const installed = fs.readdirSync(targetRoot).sort();
const unexpected = installed.filter((name) => !preservedInstallFiles.has(name));
if (unexpected.length) {
  console.warn(`Noria install warning: non-release files remain in ${targetRoot}: ${unexpected.join(", ")}`);
  console.warn("Run without --keep-extra to remove development files while preserving data.json.");
}

console.log(`Noria installed to ${targetRoot}`);
console.log(`Installed files: ${installed.join(", ")}`);
