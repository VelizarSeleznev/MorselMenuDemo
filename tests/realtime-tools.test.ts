import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeTools } from '../lib/realtime-tools.ts';
const call = {
  type: 'function_call',
  status: 'completed',
  call_id: 'c1',
  name: 'edit_basket',
  arguments: '{"ok":true}',
};
test('completed tool runs before response done, once, and continuation waits', () => {
  const sent: any[] = [];
  let executed = 0;
  const runner = new RealtimeTools(
    () => {
      executed++;
      return { ok: true };
    },
    (e) => sent.push(e),
  );
  runner.handle({ type: 'response.created', response: { id: 'r' } });
  runner.handle({
    type: 'response.output_item.done',
    response_id: 'r',
    item: call,
  });
  assert.equal(executed, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].item.type, 'function_call_output');
  runner.handle({
    type: 'response.output_item.done',
    response_id: 'r',
    item: call,
  });
  runner.handle({
    type: 'response.done',
    response: { id: 'r', status: 'completed', output: [call] },
  });
  assert.equal(executed, 1);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].type, 'response.create');
});
test('interrupted and incomplete items cannot change the basket', () => {
  let executed = 0;
  const runner = new RealtimeTools(
    () => {
      executed++;
      return {};
    },
    () => {},
  );
  runner.handle({ type: 'response.created', response: { id: 'r' } });
  runner.handle({
    type: 'response.output_item.done',
    response_id: 'r',
    item: { ...call, status: 'incomplete' },
  });
  runner.interrupt();
  runner.handle({
    type: 'response.output_item.done',
    response_id: 'r',
    item: call,
  });
  runner.handle({
    type: 'response.done',
    response: { id: 'r', status: 'cancelled', output: [call] },
  });
  assert.equal(executed, 0);
});
test('response.done fallback handles complete calls if item event was missing', () => {
  let executed = 0;
  const runner = new RealtimeTools(
    () => {
      executed++;
      return {};
    },
    () => {},
  );
  runner.handle({
    type: 'response.done',
    response: { id: 'r', status: 'completed', output: [call] },
  });
  assert.equal(executed, 1);
});

test('background speech does not cancel a completed basket tool', () => {
  let executed = 0;
  const runner = new RealtimeTools(
    () => {
      executed++;
      return {};
    },
    () => {},
  );
  runner.handle({ type: 'response.created', response: { id: 'r' } });
  runner.handle({ type: 'input_audio_buffer.speech_started' });
  runner.handle({
    type: 'response.output_item.done',
    response_id: 'r',
    item: call,
  });
  assert.equal(executed, 1);
});
