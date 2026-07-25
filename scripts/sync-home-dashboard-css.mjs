import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(scriptDir, "..");
const bootstrapPath = path.join(
  pluginRoot,
  "src",
  "runtime",
  "views",
  "dashboard",
  "home",
  "sections",
  "bootstrap-style",
  "view.js"
);
const stylesPath = path.join(pluginRoot, "styles.css");
const startMarker = "/* NORIA_HOME_DASHBOARD_CSS_START */";
const endMarker = "/* NORIA_HOME_DASHBOARD_CSS_END */";

const bootstrapSource = fs.readFileSync(bootstrapPath, "utf8");
const cssMatch = bootstrapSource.match(
  /style\.textContent\s*=\s*`([\s\S]*?)`;\s*\r?\n\s*if \(shouldAppendStyle\)/
);
if (!cssMatch) {
  throw new Error(`Unable to extract Home dashboard CSS from ${bootstrapPath}`);
}

const dashboardCss = String(cssMatch[1] || "")
  .replace(/^\r?\n/, "")
  .replace(/\r\n/g, "\n")
  .trimEnd();
if (!dashboardCss.includes("--dash-radius") || !dashboardCss.includes("dashboard-countdown-hero-days-v2")) {
  throw new Error("Extracted Home dashboard CSS is missing required sentinels");
}

const generatedBlock = [startMarker, dashboardCss, endMarker].join("\n");
let stylesSource = fs.readFileSync(stylesPath, "utf8").replace(/\r\n/g, "\n");
const startIndex = stylesSource.indexOf(startMarker);
const endIndex = stylesSource.indexOf(endMarker);
if ((startIndex >= 0) !== (endIndex >= 0) || (startIndex >= 0 && endIndex < startIndex)) {
  throw new Error("Home dashboard CSS markers in styles.css are incomplete or out of order");
}

if (startIndex >= 0) {
  stylesSource = `${stylesSource.slice(0, startIndex)}${generatedBlock}${stylesSource.slice(endIndex + endMarker.length)}`;
} else {
  stylesSource = `${stylesSource.trimEnd()}\n\n${generatedBlock}\n`;
}

fs.writeFileSync(stylesPath, stylesSource, "utf8");
console.log(`synced Home dashboard CSS into styles.css (${Buffer.byteLength(dashboardCss, "utf8")} bytes)`);
