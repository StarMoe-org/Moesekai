import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/lib');
const modules = new Map();
function load(filename) {
    if (modules.has(filename)) return modules.get(filename);
    const exports = {};
    modules.set(filename, exports);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: filename,
    }).outputText;
    vm.runInNewContext(compiled, { exports, URL, URLSearchParams,
        require: name => load(path.resolve(path.dirname(filename), name + '.ts')),
    }, { filename, timeout: 1000 });
    return exports;
}
const { filterCatalog, INITIAL_BROWSE } = load(path.join(root, 'moly/catalog.ts'));
const entry = (id, unitIds) => ({ key: `talk:fixture:${id}`, title: 'Table', subtitle: '', unitIds,
    fixtureIds: [20], characters: [], available: true, presentation: { category: 'fixture_story' } });
const catalog = { entries: [entry(1, [1]), entry(2, [2]), entry(3, [1, 2]), entry(4, [1, 2, 3])] };
const keys = characters => Array.from(filterCatalog(catalog, { ...INITIAL_BROWSE, characters }), row => row.key);
assert.deepEqual(keys([]), ['talk:fixture:1', 'talk:fixture:2', 'talk:fixture:3', 'talk:fixture:4']);
assert.deepEqual(keys([1]), ['talk:fixture:1', 'talk:fixture:3', 'talk:fixture:4']);
assert.deepEqual(keys([1, 2]), ['talk:fixture:3', 'talk:fixture:4']);
assert.deepEqual(keys([2, 1]), keys([1, 2]));
assert.deepEqual(keys([1, 2, 3]), ['talk:fixture:4']);
assert.deepEqual(keys([1, 99]), []);
console.log('Conversation multi-select requires every selected participant; clear restores all results.');
