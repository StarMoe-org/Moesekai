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
const {runtimeSelectionFilters,reconcileSelectionError}=exports;
const refused={code:'selection_unavailable',key:'talk:common:8572'};
const admitted={ready:true,selected:{key:refused.key,available:true},status:{phase:'playing',error:null}};
assert.equal(reconcileSelectionError(refused,null),refused);
assert.equal(reconcileSelectionError(refused,{...admitted,ready:false}),refused);
assert.equal(reconcileSelectionError(refused,{...admitted,selected:{key:'talk:common:8573',available:true}}),refused);
assert.equal(reconcileSelectionError(refused,{...admitted,selected:{key:refused.key,available:false}}),refused);
assert.equal(reconcileSelectionError(refused,{...admitted,status:{phase:'error',error:'runtime_failed'}}),refused);
assert.equal(reconcileSelectionError(refused,admitted),null);
const fatal={...refused,fatal:true};
assert.equal(reconcileSelectionError(fatal,admitted),fatal);
const unrelated={code:'source_mismatch'};
assert.equal(reconcileSelectionError(unrelated,admitted),unrelated);
console.log('PASS only successful exact-key admission clears a transient selection error');
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
const runtime=fs.readFileSync(path.join(root,'src/components/mysekai-interactions/RuntimeStage.tsx'),'utf8');
assert.ok(runtime.includes('content: request.play ? undefined : request.content ?? undefined'));
assert.ok(client.includes('onSnapshot={receiveSnapshot}'));
