import {
  GoogleGenAI,
  Modality,
  type Session,
} from '@google/genai';
import {
  LIVE_MODEL,
  instructions,
  functionDeclarations,
  executeMenuTool,
  type MenuContext,
} from '../lib/assistant.ts';
// Manual integration check: consumes a real provider session.
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error('Missing GEMINI_API_KEY');
const ai = new GoogleGenAI({
  apiKey: key,
  httpOptions: { apiVersion: 'v1beta', timeout: 15000 },
});
const config = {
  responseModalities: [Modality.AUDIO],
  systemInstruction: instructions,
  tools: [{ functionDeclarations: functionDeclarations.map(tool => ({ ...tool, behavior: 'BLOCKING' })) as any }],
  inputAudioTranscription: {},
  outputAudioTranscription: {},
  speechConfig: {
    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
  },
  maxOutputTokens: 512,
};
const token = await ai.authTokens.create({
  config: {
    uses: 1,
    expireTime: new Date(Date.now() + 120000).toISOString(),
    liveConnectConstraints: { model: LIVE_MODEL, config },
  },
});
let context: MenuContext = {
  basket: [],
  version: 0,
  selectedDish: null,
  selectedPortion: 'regular',
  latestUserText:
    'Please add one small pepperoni pizza and one regular truffle fries to my basket now.',
};
const negativeAudio = !!process.env.SMOKE_NEGATIVE_AUDIO;
if (negativeAudio) {
  context.basket = [
    { id: 'pizza', portion: 'regular', quantity: 1 },
    { id: 'icecream', portion: 'small', quantity: 1 },
  ];
  context.latestUserText = '';
}
const initialBasket = JSON.stringify(context.basket);
let session: Session;
let audioBytes = 0;
let text = '';
let inputText = '';
let turn = 0;
const followups = [
  'Now make the pizza regular and remove the fries. Keep everything else.',
  'Do you have ice cream?',
  'Я уже наелся, но хочется что-нибудь маленькое. Что посоветуешь?',
  'Нет, я сказал: можешь мне яйца полимонить? Я ничего не заказывал.',
  'Add one small vanilla ice cream to the basket.',
  'Нет, я просто спрашивал про мороженое. Не меняй корзину.',
  'Убери только мороженое из корзины, пиццу оставь.',
];
if (negativeAudio) followups.length = 0;
const turnResults: unknown[] = [];
let before = negativeAudio ? initialBasket : '';

const tools: string[] = [];
const client = new GoogleGenAI({
  apiKey: token.name!,
  httpOptions: { apiVersion: 'v1beta' },
});
let done: () => void;
const finished = new Promise<void>((r) => (done = r));
let failed = false;
const timeout = setTimeout(() => {
  failed = true;
  console.log('TIMEOUT');
  session?.close();
  done();
}, 90000);
session = await client.live.connect({
  model: LIVE_MODEL,
  config,
  callbacks: {
    onmessage: (m) => {
      for (const call of m.toolCall?.functionCalls || []) {
        const result = executeMenuTool(
          call.name || '',
          call.args || {},
          context,
        );
        tools.push(call.name || '');
        if (result.basket)
          context = {
            ...context,
            basket: result.basket,
            version: context.version + 1,
          };
        session.sendToolResponse({
          functionResponses: [
            { id: call.id, name: call.name, response: result.result },
          ],
        });
      }
      for (const part of m.serverContent?.modelTurn?.parts || [])
        if (part.inlineData?.data)
          audioBytes += Buffer.from(part.inlineData.data, 'base64').length;
      inputText += m.serverContent?.inputTranscription?.text || '';
      if (negativeAudio) context.latestUserText = inputText;
      text += m.serverContent?.outputTranscription?.text || '';
      if (m.serverContent?.turnComplete) {
        const unchangedTurn = negativeAudio || [2, 3, 4, 6].includes(turn);
        const unchanged =
          !unchangedTurn || JSON.stringify(context.basket) === before;
        if (!unchanged) failed = true;
        turnResults.push({
          turn,
          unchangedCheck: unchanged,
          basket: context.basket,
        });
        before = JSON.stringify(context.basket);
        if (turn < followups.length) {
          context.latestUserText = followups[turn];
          session.sendRealtimeInput({ text: followups[turn++] });
        } else done();
      }
    },
    onerror: (e) => {
      failed = true;
      console.log(
        'LIVE_ERROR',
        String(e.message || 'provider error')
          .replaceAll(key, '[redacted]')
          .slice(0, 500),
      );
      done();
    },
    onclose: (e) => {
      if (!text) {
        failed = true;
        console.log(
          'CLOSED',
          e.code,
          e.reason?.replaceAll(key, '[redacted]').slice(0, 300),
        );
      }
      done();
    },
  },
});
if (process.env.SMOKE_AUDIO_PCM || process.env.SMOKE_NEGATIVE_AUDIO) {
  const { readFile } = await import('node:fs/promises');
  const pcm = await readFile(
    (process.env.SMOKE_NEGATIVE_AUDIO || process.env.SMOKE_AUDIO_PCM)!,
  );
  for (let i = 0; i < pcm.length; i += 1280) {
    session.sendRealtimeInput({
      audio: {
        data: pcm.subarray(i, i + 1280).toString('base64'),
        mimeType: 'audio/pcm;rate=16000',
      },
    });
    await new Promise((r) => setTimeout(r, 40));
  }
  session.sendRealtimeInput({ audioStreamEnd: true });
} else {
  session.sendRealtimeInput({
    text: 'Please add one small pepperoni pizza and one regular truffle fries to my basket now. Tell me the total in English.',
  });
}
await finished;
clearTimeout(timeout);
session.close();
const success =
  !failed &&
  audioBytes > 0 &&
  (negativeAudio
    ? JSON.stringify(context.basket) === initialBasket && !!inputText
    : context.basket.length === 1 &&
      context.basket[0].id === 'pizza' &&
      context.basket[0].portion === 'regular');
console.log(
  JSON.stringify({
    model: LIVE_MODEL,
    tools,
    basket: context.basket,
    audioBytes,
    text,
    inputText,
    turnResults,
    success,
  }),
);
if (!success) process.exitCode = 1;
