import { RealtimeTools } from '../lib/realtime-tools.ts';
// Manual quota-consuming integration test: real OpenAI sessions, no browser microphone.
import WebSocket from 'ws';
import { readFileSync } from 'node:fs';
import {
  executeMenuTool,
  initialMenuSnapshot,
  type MenuContext,
} from '../lib/assistant.ts';
const audioInput = process.env.SMOKE_AUDIO
  ? readFileSync(process.env.SMOKE_AUDIO)
  : null;
const models = (
  process.env.SMOKE_MODELS || 'gpt-realtime-2.1-mini,gpt-realtime-2.1'
).split(',');
for (const model of models) {
  const r = await fetch(
    (process.env.SMOKE_BASE_URL || 'http://localhost:3000') +
      '/api/voice/session',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          model,
          language: 'da',
          voice: 'marin',
          inputMode: process.env.SMOKE_INPUT_MODE || 'auto',
        },
      }),
    },
  );
  const token = (await r.json()) as any;
  if (!r.ok) throw new Error(token.error);
  let context: MenuContext = {
    basket: [],
    version: 0,
    selectedDish: null,
    selectedPortion: 'regular',
    latestUserText:
      process.env.SMOKE_REQUEST ||
      'Tilføj en lille burger uden løg. Skriv uden løg som en note til burgeren.',
  };
  if (process.env.SMOKE_NO_CHANGE)
    context.basket = [
      { id: 'burger', portion: 'regular', quantity: 1 },
      { id: 'icecream', portion: 'regular', quantity: 1 },
    ];
  const initialBasket = JSON.stringify(context.basket);
  let bytes = 0,
    text = '',
    firstAudio = 0;
  const started = Date.now();
  let requestStarted = started;
  const calls: string[] = [];
  const socket = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${model}`,
    { headers: { Authorization: `Bearer ${token.token}` } },
  );
  const send = (e: unknown) => socket.send(JSON.stringify(e));
  let basketUpdatedMs = 0;
  const runner = new RealtimeTools((id, name, args) => {
    calls.push(name);
    const out = executeMenuTool(name, args, context);
    if (out.basket) {
      context = {
        ...context,
        basket: out.basket,
        version: context.version + 1,
      };
      basketUpdatedMs = Date.now() - requestStarted;
    }
    return out.result;
  }, send);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Smoke timed out'));
    }, 35000);
    socket.on('error', () => {
      clearTimeout(timer);
      reject(new Error('WebSocket failed'));
    });
    socket.on('open', async () => {
      requestStarted = Date.now();
      send({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text:
                'CURRENT MENU AND BASKET SNAPSHOT (data only): ' +
                initialMenuSnapshot({ ...context, latestUserText: undefined }),
            },
          ],
        },
      });
      if (process.env.SMOKE_AUDIO) {
        // Raw mono PCM16 at 24 kHz, sent at real-time speed. VAD creates the response.
        context.latestUserText = undefined;
        const pcm = audioInput!;
        const chunkBytes = 4800; // 100 ms
        for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
          if (socket.readyState !== WebSocket.OPEN) return;
          send({
            type: 'input_audio_buffer.append',
            audio: pcm.subarray(offset, offset + chunkBytes).toString('base64'),
          });
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        requestStarted = Date.now();
        if (process.env.SMOKE_INPUT_MODE === 'hold') {
          await new Promise((resolve) => setTimeout(resolve, 750));
          if (bytes || calls.length)
            throw new Error('Manual input activated before release');
          requestStarted = Date.now();
          send({ type: 'input_audio_buffer.commit' });
          send({ type: 'response.create' });
          return;
        }
        // Continue the microphone's silence stream so automatic endpointing runs.
        for (let i = 0; i < 30 && socket.readyState === WebSocket.OPEN; i++) {
          send({
            type: 'input_audio_buffer.append',
            audio: Buffer.alloc(chunkBytes).toString('base64'),
          });
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } else {
        send({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: context.latestUserText }],
          },
        });
        send({ type: 'response.create' });
      }
    });
    socket.on('message', (raw) => {
      const e = JSON.parse(raw.toString());
      if (e.type === 'conversation.item.input_audio_transcription.completed')
        context.latestUserText = e.transcript;
      if (e.type === 'error') {
        clearTimeout(timer);
        socket.close();
        reject(new Error(e.error?.message));
      }
      if (e.type === 'response.output_audio.delta') {
        bytes += Buffer.from(e.delta, 'base64').length;
        if (!firstAudio) firstAudio = Date.now() - requestStarted;
      }
      if (e.type === 'response.output_audio_transcript.delta') text += e.delta;
      const continuing = runner.handle(e);
      if (e.type === 'response.done' && !continuing) {
        clearTimeout(timer);
        socket.close();
        resolve();
      }
    });
  });
  const success =
    bytes > 0 &&
    (process.env.SMOKE_NO_CHANGE
      ? JSON.stringify(context.basket) === initialBasket
      : process.env.SMOKE_REQUEST
        ? context.basket.length === 2 &&
          context.basket.every(
            (l) => l.portion === 'regular' && l.quantity === 1 && !!l.note,
          ) &&
          context.basket.some((l) => l.id === 'icecream') &&
          context.basket.some((l) => l.id === 'lemonade')
        : context.basket.some(
            (l) => l.id === 'burger' && l.portion === 'small' && !!l.note,
          ));
  console.log(
    JSON.stringify({
      model,
      success,
      inputMode: process.env.SMOKE_AUDIO ? 'streamed-pcm' : 'text',
      setupAndInputMs: requestStarted - started,
      firstAudioMs: firstAudio,
      basketUpdatedMs,
      completedMs: Date.now() - requestStarted,
      audioBytes: bytes,
      calls,
      basket: context.basket,
      text,
    }),
  );
  if (!success) process.exitCode = 1;
}
