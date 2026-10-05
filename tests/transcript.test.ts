import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendTranscript } from '../lib/transcript.ts';
test('interleaved input/output fragments stay in their own utterances', () => {
  let messages = appendTranscript([], 'user', 'Do not ', 'u1');
  messages = appendTranscript(messages, 'assistant', 'I heard ', 'a1');
  messages = appendTranscript(messages, 'user', 'add ice cream.', 'u1');
  messages = appendTranscript(messages, 'assistant', 'you.', 'a1');
  assert.deepEqual(
    messages.map((m) => m.text),
    ['Do not add ice cream.', 'I heard you.'],
  );
});
test('new utterance never merges with a previous utterance by the same speaker', () => {
  let messages = appendTranscript([], 'user', 'No.', 'u1');
  messages = appendTranscript(messages, 'user', 'I meant pizza.', 'u2');
  assert.equal(messages.length, 2);
  assert.equal(appendTranscript(messages, 'user', '', 'u2').length, 2);
});
