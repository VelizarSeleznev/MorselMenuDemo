import {
  GoogleGenAI,
  Modality,
  ActivityHandling,
} from '@google/genai';
import { env } from 'cloudflare:workers';
import {
  LIVE_MODEL,
  instructions,
  functionDeclarations,
} from '@/lib/assistant';
import {
  validSettings,
  languageInstruction,
  defaultSettings,
  voiceModels,
} from '@/lib/voice-settings';
import { openAIConfig } from '@/lib/openai-config';
export const dynamic = 'force-dynamic';
const recent = new Map<string, number[]>();
export async function POST(request: Request) {
  const url = new URL(request.url);
  const user = request.headers.get('oai-authenticated-user-id');
  const local =
    process.env.NODE_ENV === 'development' &&
    ['localhost', '127.0.0.1'].includes(url.hostname);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin)
    return Response.json(
      { error: 'This request must come from the menu.' },
      { status: 403 },
    );
  if (!user && !local)
    return Response.json(
      { error: 'Sign in to this private demo to use the assistant.' },
      { status: 401 },
    );
  const id = user || 'local';
  const now = Date.now();
  const times = (recent.get(id) || []).filter((t) => now - t < 60000);
  if (times.length >= 4)
    return Response.json(
      { error: 'A few too many connections. Please try again in a minute.' },
      { status: 429 },
    );
  recent.set(id, [...times, now]);
  if (recent.size > 500)
    for (const [k, v] of recent)
      if (v.every((t) => now - t > 60000)) recent.delete(k);
  const body = await request.json().catch(() => ({}));
  const settings =
    (body as { settings?: unknown } | null)?.settings || defaultSettings;
  if (!validSettings(settings))
    return Response.json({ error: 'Invalid voice settings.' }, { status: 400 });
  if (voiceModels[settings.model].provider === 'openai') {
    const key =
      ((env as Record<string, unknown>).OPENAI_API_KEY as string) ||
      process.env.OPENAI_API_KEY;
    if (!key)
      return Response.json(
        { error: 'OpenAI is not configured.' },
        { status: 503 },
      );
    try {
      const r = await fetch(
        'https://api.openai.com/v1/realtime/client_secrets',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            expires_after: { anchor: 'created_at', seconds: 60 },
            session: openAIConfig(settings),
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      const j = (await r.json()) as any;
      if (!r.ok || !j.value)
        return Response.json(
          {
            error:
              r.status === 429
                ? 'OpenAI quota or rate limit reached.'
                : 'OpenAI could not start this model. Try another model.',
            code: j.error?.code,
          },
          { status: r.status === 429 ? 429 : 502 },
        );
      return Response.json(
        {
          provider: 'openai',
          token: j.value,
          model: settings.model,
          maxSessionSeconds: 240,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch {
      return Response.json(
        { error: 'OpenAI connection timed out. Please try again.' },
        { status: 502 },
      );
    }
  }
  const key =
    ((env as Record<string, unknown>).GEMINI_API_KEY as string) ||
    process.env.GEMINI_API_KEY;
  if (!key)
    return Response.json(
      { error: 'The voice assistant is not configured yet.' },
      { status: 503 },
    );
  try {
    const ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: { apiVersion: 'v1beta', timeout: 15000 },
    });
    const config = {
      responseModalities: [Modality.AUDIO],
      systemInstruction:
        instructions + '\n' + languageInstruction(settings.language),
      tools: [{ functionDeclarations: functionDeclarations.map(tool => ({ ...tool, behavior: 'BLOCKING' })) as any }],
      realtimeInputConfig: {
        activityHandling: ActivityHandling.NO_INTERRUPTION,
        automaticActivityDetection:
          settings.inputMode !== 'auto'
            ? { disabled: true }
            : { silenceDurationMs: 650, prefixPaddingMs: 200 },
      },
      historyConfig: { initialHistoryInClientContent: true },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voice } },
      },
      maxOutputTokens: 1200,
    };
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        newSessionExpireTime: new Date(now + 60000).toISOString(),
        expireTime: new Date(now + 300000).toISOString(),
        liveConnectConstraints: { model: LIVE_MODEL, config },
      },
    });
    if (!token.name) throw new Error('missing token');
    return Response.json(
      { token: token.name, model: LIVE_MODEL, config, maxSessionSeconds: 240 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const message = String(e);
    const quota = /429|RESOURCE_EXHAUSTED/i.test(message);
    return Response.json(
      {
        error: quota
          ? 'The AI quota is used up. Please try later — your basket is saved.'
          : 'The AI connection could not start. Please try again.',
        code: quota ? 'quota_exhausted' : 'provider_unavailable',
      },
      { status: quota ? 429 : 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
