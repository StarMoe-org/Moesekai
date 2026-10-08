import assert from 'node:assert/strict';
import { readSearchCompletion } from '../src/lib/deck-engine/search-completion.ts';

assert.equal(readSearchCompletion({ completion: 'complete', timed_out: false }), 'complete');
assert.equal(readSearchCompletion({ completion: 'timed_out', timed_out: true }), 'timed_out');

// A previous deployment omitted completion entirely. Never upgrade that unknown state to proof.
for (const response of [
    {},
    { completion: 'complete', timed_out: true },
    { completion: 'timed_out', timed_out: false },
    { completion: 'Complete', timed_out: false },
    { completion: 'complete' },
]) {
    assert.throws(() => readSearchCompletion(response), /INVALID_SEARCH_COMPLETION/);
}
console.log('Deck search completion protocol checks passed.');
