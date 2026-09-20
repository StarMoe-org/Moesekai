import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filename = path.join(root, 'src/lib/moly/workspaceNavigation.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: filename,
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, URLSearchParams }, { filename, timeout: 1000 });
const { parseWorkspaceNavigation: parse, workspaceQuery: serialize, validContentKey, positiveId } = exports;
const state = (query, defaultTab) => parse(new URLSearchParams(query), defaultTab);
let checks = 0;
function check(name, action) { action(); checks++; console.log(`PASS ${name}`); }
const plain = value => JSON.parse(JSON.stringify(value));

check('story browser defaults to conversations', () => {
    assert.equal(state('').browse.tab, 'conversations');
    assert.equal(state('', 'conversations').browse.tab, 'conversations');
});
check('fixture context opens furniture stories without making furniture a browser tab', () => {
    const value = state('region=jp&fixture=534&search=table');
    assert.equal(value.content, null);
    assert.equal(value.browse.fixture, 534);
    assert.equal(value.browse.query, 'table');
    assert.equal(value.browse.tab, 'performances');
});
check('a cleared selection keeps fixture context without reopening its detail', () => {
    const value = state('fixture=534&content=&tab=conversations');
    assert.equal(value.content, null);
    assert.equal(state(serialize(value).toString()).content, null);
    assert.equal(state(serialize(value).toString()).browse.fixture, 534);
});
check('deep links infer content categories without rewriting an explicit tab', () => {
    assert.equal(state('content=talk%3Afixture%3A6117').browse.tab, 'performances');
    assert.equal(state('content=activity%3Anotalk%3A534%3A14').browse.tab, 'activities');
    assert.equal(state('content=talk%3Ageneral%3A3912').browse.tab, 'conversations');
    assert.equal(state('tab=furniture&content=talk%3Afixture%3A6117').browse.tab, 'performances');
    assert.equal(state('tab=furniture&content=activity%3Anotalk%3A534%3A14').browse.tab, 'activities');
    assert.equal(state('tab=furniture').browse.tab, 'conversations');
});
check('positive IDs are exact bounded integers, never JavaScript numeric coercions', () => {
    for (const id of ['', '0', '-1', '+1', '1e3', '1.5', 'Infinity', ' 1', '2147483648', '01']) assert.equal(positiveId(id), null);
    assert.equal(positiveId('2147483647'), 2147483647);
});
check('unknown or malformed content is reported instead of passed to the bridge', () => {
    for (const key of ['talk:fixture:0', 'talk:evil:1', 'fixture:1:2', 'activity:notalk:1', 'activity:notalk:1:NaN', '<script>', 'talk:fixture:1/2']) {
        assert.equal(validContentKey(key), false);
        assert.equal(state(new URLSearchParams({ content: key })).invalidContent, true);
        assert.equal(state(new URLSearchParams({ content: key })).content, null);
    }
});
check('search has a codepoint limit and URL escaping cannot create parameters', () => {
    const query = '🍀'.repeat(205) + '&fixture=1#x';
    const value = state(new URLSearchParams({ q: query }));
    assert.equal(Array.from(value.browse.query).length, 200);
    assert.equal(state(serialize(value).toString()).browse.fixture, null);
});
check('source pins, paging, both character meanings and sorting survive roundtrip', () => {
    const value = state('region=cn&snapshot=cn-test&tab=performances&page=5&q=%E6%A1%8C&character=14&fixture=534&genre=2&subGenre=3&tag=4&characters=14,15&units=piapro,light_sound&sortBy=name&sortOrder=asc&availability=ready&content=talk:fixture:6117');
    assert.deepEqual(plain(state(serialize(value).toString())), plain(value));
    assert.equal(value.browse.character, 14);
    assert.deepEqual(plain(value.furniture.characters), [14, 15]);
});
check('owned state replaces stale values while unrelated campaign parameters survive', () => {
    const query = serialize(state('region=jp&tab=activities'), new URLSearchParams('region=cn&page=9&search=old&genre=99&content=fixture:1&utm_source=friend'));
    assert.equal(query.get('utm_source'), 'friend');
    assert.equal(query.get('region'), 'jp');
    for (const key of ['page', 'search', 'genre', 'content']) assert.equal(query.has(key), false);
});
check('unpublished source identity remains visible; safe guards do not silently switch regions', () => {
    assert.equal(state('region=kr').region, 'kr');
    assert.equal(state('region=unknown&snapshot=retired').region, 'unknown');
    assert.equal(state('region=unknown&snapshot=retired').snapshot, 'retired');
});
check('adversarial filter lists and page counts are bounded', () => {
    const value = state('page=2147483647&characters=1,1,-1,2,NaN&units=piapro,piapro,../evil&sortBy=evil&sortOrder=bad');
    assert.equal(value.page, 100000);
    assert.deepEqual(plain(value.furniture.characters), [1, 2]);
    assert.deepEqual(plain(value.furniture.units), ['piapro']);
    assert.equal(value.furniture.sortBy, 'id');
    assert.equal(value.furniture.sortOrder, 'desc');
});
console.log(`${checks} MySekai navigation contracts passed.`);
