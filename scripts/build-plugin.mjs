import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profiles=JSON.parse(fs.readFileSync(path.join(root,'build-profiles.json'),'utf8'));
const modules=profiles.public;
if(!Array.isArray(modules)||modules.some(name=>name!=='media'))throw Error('Only core-owned modules can enter the public build; private modules need explicit source promotion.');
const result = await build({
  absWorkingDir: root,
  entryPoints: ["src/main.js"],
  bundle: true,
  define: {__NORIA_MEDIA__: String(modules.includes('media')), __NORIA_MODULES__: JSON.stringify(modules)},
  platform: "node",
  format: "cjs",
  target: "es2018",
  minify: true,
  charset: "utf8",
  legalComments: "inline",
  external: ["obsidian"],
  outfile: "main.js",
  metafile: true,
  write: false
});

function within(directory, file) {
  const relative = path.relative(directory, file);
  return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

// Check resolved inputs before writing output: ignored files and directory links
// must not make private sources part of a public artifact.
const publicRoot = fs.realpathSync(root);
const allowedRoots = [path.join(publicRoot, "src"), path.join(publicRoot, "node_modules")];
const inputs = Object.keys(result.metafile.inputs).filter(input=>input!=='<define:__NORIA_MODULES__>');
const outside = inputs.filter(input => {
  const file = fs.realpathSync(path.resolve(root, input));
  return !allowedRoots.some(directory => within(directory, file));
});
const domainInputs=inputs.filter(input=>/[\\/]media-(?!feature\.js)[^/\\]+\.js$/.test(input));
if(!modules.includes('media')&&domainInputs.length)throw new Error(`Self-use media implementation in public bundle: ${domainInputs.join(', ')}`);
if (outside.length) throw new Error(`Inputs outside public bundle scope:\n${outside.join("\n")}`);
if (result.outputFiles.length !== 1 || result.outputFiles[0].path !== path.join(root, "main.js")) {
  throw new Error("The public bundle must produce main.js only; shared styles belong in styles.css.");
}

fs.mkdirSync(path.join(root,'evidence'),{recursive:true});
fs.writeFileSync(path.join(root,'evidence/public-build-info.json'),JSON.stringify({modules,inputs},null,2)+'\n');
fs.writeFileSync(path.join(root, "main.js"), result.outputFiles[0].contents);
console.log(`built Noria main.js (${inputs.length} inputs within public source and dependencies)`);
