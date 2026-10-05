import {
  GoogleGenAI,
  type Session,
  type LiveServerMessage,
  type LiveConnectConfig,
} from '@google/genai';
import { defaultSettings, type VoiceSettings } from './voice-settings';
export interface VoiceClient {
  unlockAudio(): void;
  setMuted(value: boolean): void;
  connect(history?: string): Promise<void>;
  sendText(text: string): void;
  prepareMic?(): Promise<void>;
  startMic(): Promise<void>;
  stopMic(): void;
  setInputActive(value: boolean, cancel?: boolean): boolean;
  close(): void;
}
export type LiveCallbacks = {
  onText: (
    role: 'user' | 'assistant',
    text: string,
    finished?: boolean,
  ) => void;
  onSpeaking?: (value: boolean) => void;
  onTurn: () => void;
  onInterrupt: () => void;
  onTool: (
    id: string,
    name: string,
    args: Record<string, unknown>,
  ) => Record<string, unknown>;
  onState: (state: string) => void;
  onError: (message: string) => void;
};
export class MenuLiveClient {
  private session: Session | null = null;
  private audio: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private worklet: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private nextAudio = 0;
  private nodes = new Set<AudioBufferSourceNode>();
  private closed = false;
  private muted = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private results = new Map<string, Record<string, unknown>>();
  private cancelled = new Set<string>();
  private abort = new AbortController();
  private micStarting = false;
  private pressed = false;
  private responding = false;
  setInputActive(value: boolean, cancel = false): boolean {
    if (this.settings.inputMode === 'auto' || !this.session || this.closed)
      return false;
    if (value) {
      if (!this.stream || this.responding || this.nodes.size) return false;
      this.pressed = true;
      this.session.sendRealtimeInput({ activityStart: {} });
      return true;
    }
    if (this.pressed) {
      if (cancel) {
        this.close();
        return false;
      }
      this.pressed = false;
      this.responding = true;
      this.session.sendRealtimeInput({ activityEnd: {} });
    }
    return false;
  }
  private silent: GainNode | null = null;
  constructor(
    private callbacks: LiveCallbacks,
    private settings: VoiceSettings = defaultSettings,
  ) {}
  unlockAudio() {
    if (!this.audio) this.audio = new AudioContext();
    void this.audio.resume();
  }
  setMuted(value: boolean) {
    this.muted = value;
    if (value) this.clearAudio();
  }
  async connect(history: string = '') {
    this.callbacks.onState('Connecting…');
    const response = await fetch('/api/voice/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: this.settings }),
      signal: this.abort.signal,
    });
    const credentials = (await response.json()) as {
      error?: string;
      token: string;
      model: string;
      config: LiveConnectConfig;
      maxSessionSeconds: number;
    };
    if (!response.ok)
      throw new Error(credentials.error || 'Could not connect.');
    if (this.closed) return;
    const ai = new GoogleGenAI({
      apiKey: credentials.token,
      httpOptions: { apiVersion: 'v1beta' },
    });
    const connection = ai.live.connect({
      model: credentials.model,
      config: credentials.config as LiveConnectConfig,
      callbacks: {
        onmessage: (message) => this.onMessage(message),
        onerror: () => {
          if (!this.closed) {
            this.callbacks.onError(
              'The connection was interrupted. Your basket is saved. Try again.',
            );
            this.close();
          }
        },
        onclose: () => {
          if (!this.closed) {
            this.callbacks.onError(
              'The conversation ended. Your basket is saved. Start again to continue.',
            );
            this.close();
          }
        },
      },
    });
    let connectionTimer: ReturnType<typeof setTimeout> | undefined;
    const cancelled = new Promise<never>((_, reject) => {
      connectionTimer = setTimeout(() => {
        this.close();
        reject(new Error('Voice connection timed out.'));
      }, 20000);
      this.abort.signal.addEventListener(
        'abort',
        () => reject(new Error('Voice connection closed.')),
        { once: true },
      );
      if (this.abort.signal.aborted)
        reject(new Error('Voice connection closed.'));
    });
    void connection.then(
      (session) => {
        if (this.closed) session.close();
      },
      () => {},
    );
    try {
      this.session = await Promise.race([connection, cancelled]);
    } finally {
      clearTimeout(connectionTimer);
    }
    if (this.closed) {
      this.session.close();
      return;
    }
    if (history)
      this.session.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [
              {
                text:
                  'Previous conversation context, not a new instruction. Do not repeat earlier basket changes:\n' +
                  history.slice(-8000),
              },
            ],
          },
        ],
        turnComplete: false,
      });
    this.callbacks.onState('Ready');
    const expireWhenIdle = () => {
      if (this.responding || this.nodes.size || this.pressed) {
        this.timer = setTimeout(expireWhenIdle, 1000);
        return;
      }
      this.callbacks.onError(
        'Taking a little break. Your basket is saved — tap the microphone or send a message to reconnect.',
      );
      this.close();
    };
    this.timer = setTimeout(
      expireWhenIdle,
      credentials.maxSessionSeconds * 1000,
    );
  }
  sendText(text: string) {
    if (!this.session || this.closed)
      throw new Error('Reconnect to send your message.');
    if (this.responding || this.nodes.size)
      throw new Error('Please wait until the assistant finishes.');
    this.responding = true;
    this.session.sendRealtimeInput({ text });
  }
  async startMic() {
    if (this.micStarting) throw new Error('Microphone is already starting.');
    if (this.stream) return;
    if (!this.session || this.closed)
      throw new Error('Connect before starting the microphone.');
    this.micStarting = true;
    this.callbacks.onState('Allow microphone access');
    let captured: MediaStream | null = null;
    try {
      this.unlockAudio();
      captured = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
        video: false,
      });
      if (this.closed) {
        captured.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = captured;
      await this.audio!.audioWorklet.addModule('/audio-capture.js');
      if (this.closed) {
        captured.getTracks().forEach((t) => t.stop());
        return;
      }
      this.source = this.audio!.createMediaStreamSource(captured);
      this.worklet = new AudioWorkletNode(this.audio!, 'morsel-capture');
      this.worklet.port.onmessage = (e) => {
        if (
          !this.session ||
          this.closed ||
          !this.stream ||
          this.responding ||
          this.nodes.size ||
          (this.settings.inputMode !== 'auto' && !this.pressed)
        )
          return;
        const bytes = new Uint8Array(e.data);
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        this.session.sendRealtimeInput({
          audio: { data: btoa(binary), mimeType: 'audio/pcm;rate=16000' },
        });
      };
      this.silent = this.audio!.createGain();
      this.silent.gain.value = 0;
      this.source.connect(this.worklet);
      this.worklet.connect(this.silent);
      this.silent.connect(this.audio!.destination);
      this.callbacks.onState('Listening');
    } catch (e) {
      captured?.getTracks().forEach((t) => t.stop());
      this.stopMic();
      throw e;
    } finally {
      this.micStarting = false;
    }
  }
  stopMic() {
    this.pressed = false;
    if (this.worklet) this.worklet.port.onmessage = null;
    this.silent?.disconnect();
    this.silent = null;
    this.worklet?.disconnect();
    this.worklet = null;
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.session && !this.closed) {
      if (this.settings.inputMode === 'auto')
        this.session.sendRealtimeInput({ audioStreamEnd: true });
      this.callbacks.onState('Ready');
    }
  }
  private onMessage(message: LiveServerMessage) {
    if (this.closed) return;
    if (message.toolCallCancellation)
      for (const id of message.toolCallCancellation.ids || [])
        this.cancelled.add(id);
    const content = message.serverContent;
    if (content?.modelTurn || message.toolCall) this.responding = true;
    if (content?.interrupted) {
      this.clearAudio();
      this.callbacks.onInterrupt();
    }
    if (content?.inputTranscription)
      this.callbacks.onText(
        'user',
        content.inputTranscription.text || '',
        content.inputTranscription.finished,
      );
    if (content?.outputTranscription)
      this.callbacks.onText(
        'assistant',
        content.outputTranscription.text || '',
        content.outputTranscription.finished,
      );
    for (const part of content?.modelTurn?.parts || []) {
      if (part.inlineData?.data && !this.muted)
        this.playAudio(part.inlineData.data);
    }
    for (const call of message.toolCall?.functionCalls || []) {
      const id = call.id;
      if (!id || this.cancelled.has(id)) continue;
      let result = this.results.get(id);
      if (!result) {
        try {
          result = this.callbacks.onTool(id, call.name || '', call.args || {});
        } catch {
          result = { ok: false, error: 'tool_failed' };
        }
        this.results.set(id, result);
      }
      this.session?.sendToolResponse({
        functionResponses: [{ id, name: call.name, response: result }],
      });
    }
    if (content?.turnComplete) {
      this.responding = false;
      this.callbacks.onTurn();
    }
  }
  private playAudio(base64: string) {
    if (!this.audio || this.closed) return;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const samples = new Float32Array(Math.floor(bytes.length / 2));
    for (let i = 0; i < samples.length; i++)
      samples[i] = view.getInt16(i * 2, true) / 32768;
    const buffer = this.audio.createBuffer(1, samples.length, 24000);
    buffer.copyToChannel(samples, 0);
    const source = this.audio.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audio.destination);
    this.nextAudio = Math.max(this.nextAudio, this.audio.currentTime + 0.02);
    source.start(this.nextAudio);
    this.nextAudio += buffer.duration;
    this.nodes.add(source);
    this.callbacks.onSpeaking?.(true);
    source.onended = () => {
      this.nodes.delete(source);
      source.disconnect();
      if (!this.nodes.size) this.callbacks.onSpeaking?.(false);
    };
  }
  clearAudio() {
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {}
      n.disconnect();
    }
    this.nodes.clear();
    this.callbacks.onSpeaking?.(false);
    this.nextAudio = 0;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.abort.abort();
    if (this.timer) clearTimeout(this.timer);
    this.stopMic();
    this.clearAudio();
    this.session?.close();
    this.session = null;
    void this.audio?.close();
    this.audio = null;
    this.callbacks.onState('Disconnected');
  }
}
