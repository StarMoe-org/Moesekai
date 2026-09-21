import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'src/lib/moly/runtimeSelection.ts');
const exports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},fileName:file}).outputText,{exports},{filename:file,timeout:1000});
const {runtimeSelectionFilters}=exports;
for(const [key,tab] of [['fixture:534','furniture'],['talk:fixture:6117','conversations'],['talk:general:3912','conversations'],['activity:notalk:1:1','activities'],['activity:preaction:8558:9','activities']]) {
 for(const mode of ['independent','current']) {
  const actual=JSON.parse(JSON.stringify(runtimeSelectionFilters(key,mode,'furniture')));
  assert.deepEqual(actual,{tab,query:'',character:null,fixture:null,availability:'all',mode,page:0,pageSize:24});
  console.log('PASS exact source scope',key,mode);
 }
}
assert.equal(runtimeSelectionFilters(null,'independent','activities').tab,'activities');
// Selection scopes are derived from the explicit target, not a reader list's
// query, page, category, or availability. Runtime source/admission checks stay
// in Rust; this helper never swaps a key or creates a playback command.
const client=fs.readFileSync(path.join(root,'src/app/mysekai/interactions/client.tsx'),'utf8');
assert.ok(client.includes('initial: runtimeSelectionFilters(key ?? nav.content, mode, nav.browse.tab)'));
assert.ok(client.includes('player.current?.browse(runtimeSelectionFilters(key, mode))'));
assert.ok(client.includes('player.current?.browse(runtimeSelectionFilters(nav.content, mode, nav.browse.tab))'));
assert.ok(!client.includes('player.current?.browse({ ...nav.browse, mode })'));
console.log('PASS reader state stays separate for cold launch and warm switches');
