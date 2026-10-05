import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openAIConfig } from '../lib/openai-config.ts';
import { validSettings } from '../lib/voice-settings.ts';
const settings = {
  model: 'gpt-realtime-2.1',
  voice: 'marin',
  language: 'en',
} as const;
test('old saved settings default to manual input, never automatic activation', () => {
  assert.equal(validSettings(settings), true);
  assert.equal(openAIConfig(settings).audio.input.turn_detection, null);
});
test('hands-free filters noise and cannot interrupt output', () => {
  const input = openAIConfig({ ...settings, inputMode: 'auto' }).audio.input;
  assert.equal(input.turn_detection?.interrupt_response, false);
  assert.equal(input.turn_detection?.type, 'server_vad');
  assert.equal(input.noise_reduction.type, 'near_field');
  assert.equal(validSettings({ ...settings, inputMode: 'invalid' }), false);
});
