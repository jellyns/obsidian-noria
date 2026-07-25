import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const explicitTarget = process.argv[2] ? path.resolve(process.argv[2]) : "";
const targetRoot = explicitTarget || fs.mkdtempSync(path.join(os.tmpdir(), "noria-release-check-"));
if (!explicitTarget) {
  for (const asset of ["manifest.json", "main.js", "styles.css"]) {
    fs.copyFileSync(path.join(repoRoot, asset), path.join(targetRoot, asset));
  }
}

const allowedFiles = new Set(["manifest.json", "main.js", "styles.css"]);
const forbiddenNames = new Set([
  ".github",
  "config",
  "core",
  "docs/local",
  "node_modules",
  "review",
  "src",
  "tests",
  "views",
  "data.json",
  "findings.md",
  "progress.md",
  "task_plan.md"
]);

function rel(file) {
  return path.relative(targetRoot, file).replace(/\\/g, "/") || ".";
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    out.push(full);
    if (entry.isDirectory()) walk(full, out);
  }
  return out;
}

const found = walk(targetRoot).map(rel).filter((x) => x && x !== ".");
const failures = [];

for (const required of allowedFiles) {
  if (!fs.existsSync(path.join(targetRoot, required))) failures.push(`missing required release asset: ${required}`);
}

for (const item of found) {
  const normalized = item.replace(/\/+$/, "");
  if (allowedFiles.has(normalized)) continue;
  const topForbidden = [...forbiddenNames].some((forbidden) =>
    normalized === forbidden || normalized.startsWith(`${forbidden}/`)
  );
  if (topForbidden || !allowedFiles.has(normalized)) failures.push(`unexpected release file: ${normalized}`);
}

if (failures.length) {
  console.error(["Noria release check failed:", ...failures.map((x) => `- ${x}`)].join("\n"));
  process.exit(1);
}

console.log("Noria release check passed: manifest.json, main.js, styles.css only.");
