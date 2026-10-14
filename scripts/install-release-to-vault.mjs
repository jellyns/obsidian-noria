import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const releaseAssets=["manifest.json","main.js","styles.css"];
const args=process.argv.slice(2),from=args.find(arg=>arg.startsWith('--from='));
const vaultArg=args.find(arg=>!arg.startsWith('--'))||process.env.NORIA_VAULT;
function fail(message){console.error(`Noria install failed: ${message}`);process.exit(1);}
if(args.some(arg=>arg.startsWith('--')&&!arg.startsWith('--from=')&&!['--clean','--keep-extra'].includes(arg)))fail('Unknown option');
if(!vaultArg)fail('Pass an existing vault path; optionally --from=<built package directory>');
if(args.includes('--clean'))fail('--clean has been removed: installation preserves settings, migration records and recovery files.');
const vaultRoot=path.resolve(vaultArg),targetRoot=path.join(vaultRoot,'.obsidian/plugins/noria'),sourceRoot=from?path.resolve(from.slice(7)):repoRoot;
if(!fs.existsSync(vaultRoot)||!fs.statSync(vaultRoot).isDirectory())fail(`Vault path does not exist: ${vaultRoot}`);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// An optional self-use package declares its files and hashes outside the installed plugin.
let hashes=null;
if(from){
 const info=JSON.parse(fs.readFileSync(path.join(sourceRoot,'../build-info.json'),'utf8'));
 if(info.kind!=='self-use'||!info.assets||Array.isArray(info.assets))fail('Not a declared self-use package');
 hashes=info.assets;
}
const assets=hashes?Object.keys(hashes):releaseAssets;
if(!releaseAssets.every(name=>assets.includes(name)))fail('Package is missing required plugin files');
for(const name of assets)if(!releaseAssets.includes(name)&&name!=='background.cjs'&&!/^assets\/(?:[\w.-]+\/)*[\w.-]+$/.test(name)||name.split('/').some(part=>part==='.'||part==='..'))fail(`Invalid program asset: ${name}`);
function rejectLinks(root,target){
 const relative=path.relative(root,target);
 if(path.isAbsolute(relative)||relative==='..'||relative.startsWith('..'+path.sep))fail(`Path escapes its root: ${target}`);
 let current=root;
 for(const part of ['',...relative.split(path.sep).filter(Boolean)]){
  if(part)current=path.join(current,part);
  if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())fail(`Refusing symbolic link or junction install path: ${current}`);
 }
}
const contents=new Map();
for(const name of assets){
 const source=path.join(sourceRoot,name),target=path.join(targetRoot,name);
 rejectLinks(sourceRoot,source);rejectLinks(vaultRoot,target);
 if(!fs.existsSync(source)||!fs.statSync(source).isFile())fail(`Missing release asset, run build first: ${name}`);
 if(fs.existsSync(target)&&!fs.statSync(target).isFile())fail(`Install file is not a regular file: ${name}`);
 const bytes=fs.readFileSync(source);if(hashes&&sha(bytes)!==hashes[name])fail(`Package hash mismatch: ${name}`);contents.set(name,bytes);
}
const manifest=JSON.parse(contents.get('manifest.json').toString('utf8'));
if(manifest.id!=='noria'||manifest.isDesktopOnly!==true)fail('Expected desktop Noria package');
// Validate the complete package before touching any destination. Never infer that an extra file is disposable.
for(const [name,bytes]of contents){const target=path.join(targetRoot,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
console.log(`Noria installed to ${targetRoot}`);
console.log(`Updated ${assets.length} program files; all other files and settings were preserved.`);
