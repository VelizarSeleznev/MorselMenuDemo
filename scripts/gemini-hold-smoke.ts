import { GoogleGenAI, type Session } from '@google/genai';
import { readFileSync } from 'node:fs';
import {
  initialMenuSnapshot,
  executeMenuTool,
  type MenuContext,
} from '../lib/assistant.ts';
const pcm = readFileSync(process.env.SMOKE_AUDIO!);
const r = await fetch(
  (process.env.SMOKE_BASE_URL || 'http://localhost:3002') +
    '/api/voice/session',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      settings: {
        model: 'gemini-3.8-live',
        voice: 'Aoede',
        language: 'en',
        inputMode: 'hold',
      },
    }),
  },
);
const c = (await r.json()) as { error?: string; token: string; model: string; config: import('@google/genai').LiveConnectConfig };
if (!r.ok) throw Error(c.error);
let context: MenuContext = {
  basket: [],
  version: 0,
  selectedDish: null,
  selectedPortion: 'regular',
};
let bytes = 0,
  calls = 0;
let ready!: () => void, finish!: () => void, fail!: (e: Error) => void;
const setup = new Promise<void>((r) => {
  ready = r;
});
const done = new Promise<void>((r, j) => {
  finish = r;
  fail = j;
});
void done.catch(() => {});
const timer = setTimeout(
  () => fail(Error('Gemini hold test timed out')),
  25000,
);
let session: Session;
try {
  const ai = new GoogleGenAI({
    apiKey: c.token,
    httpOptions: { apiVersion: 'v1beta' },
  });
  session = await Promise.race([
    ai.live.connect({
      model: c.model,
      config: c.config,
      callbacks: {
        onmessage: (m) => {
          if (m.setupComplete) ready();
          for (const p of m.serverContent?.modelTurn?.parts || [])
            if (p.inlineData) bytes += p.inlineData.data?.length || 0;
          for (const f of m.toolCall?.functionCalls || []) {
            calls++;
            const out = executeMenuTool(f.name!, f.args || {}, context);
            if (out.basket)
              context = {
                ...context,
                basket: out.basket,
                version: context.version + 1,
              };
            session.sendToolResponse({
              functionResponses: [
                { id: f.id, name: f.name, response: out.result },
              ],
            });
          }
          if (m.serverContent?.turnComplete) finish();
        },
        onerror: () => fail(Error('Gemini connection error')),
        onclose: (e) =>
          fail(Error(`Gemini closed (${e.code}): ${e.reason.slice(0, 250)}`)),
      },
    }),
    done.then(() => {
      throw Error('Closed before setup');
    }),
  ]);
  await Promise.race([setup, done]);
  session.sendClientContent({
    turns: [{ role: 'user', parts: [{ text: initialMenuSnapshot(context) }] }],
    turnComplete: false,
  });
  session.sendRealtimeInput({ activityStart: {} });
  for (let i = 0; i < pcm.length; i += 4800) {
    session.sendRealtimeInput({
      audio: {
        data: pcm.subarray(i, i + 4800).toString('base64'),
        mimeType: 'audio/pcm;rate=24000',
      },
    });
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, 750));
  if (bytes || calls) throw Error('Activated before release');
  session.sendRealtimeInput({ activityEnd: {} });
  await done;
  const success =
    bytes > 0 &&
    context.basket.some(
      (l) => l.id === 'burger' && l.portion === 'small' && !!l.note,
    );
  console.log(
    JSON.stringify({
      success,
      audio: bytes > 0,
      calls,
      basket: context.basket,
    }),
  );
  if (!success) process.exitCode = 1;
} finally {
  clearTimeout(timer);
  session!?.close();
}
