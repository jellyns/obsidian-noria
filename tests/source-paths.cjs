const fs = require("node:fs");
const path = require("node:path");

const pluginRoot = path.resolve(__dirname, "..");

function sourcePath(rel) {
  const normalized = String(rel || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const runtimePath = path.join(pluginRoot, "src", "runtime", normalized);
  return fs.existsSync(runtimePath) ? runtimePath : path.join(pluginRoot, normalized);
}

function readSource(rel) {
  return fs.readFileSync(sourcePath(rel), "utf8");
}

module.exports = { pluginRoot, sourcePath, readSource };
