import { RealtimeTools } from './realtime-tools.ts';
import type { LiveCallbacks, VoiceClient } from './live-client';
import type { VoiceSettings } from './voice-settings';
export class OpenAILiveClient implements VoiceClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private player: HTMLAudioElement | null = null;
  private stream: MediaStream | null = null;
  private sender: RTCRtpSender | null = null;
  private abort = new AbortController();
  private closed = false;
  private starting = false;
  private micRequest: Promise<void> | null = null;
  private muted = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private toolRunner: RealtimeTools;
  private activeResponse = false;
  private playing = false;
  private awaitingReply = false;
  private pressedAt = 0;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  private syncInput() {
    const allowed =
      !this.activeResponse &&
      !this.playing &&
      !this.awaitingReply &&
      (this.settings.inputMode === 'auto' || this.pressedAt > 0);
    this.stream?.getAudioTracks().forEach((t) => {
      t.enabled = allowed;
    });
  }
  setInputActive(value: boolean, cancel = false): boolean {
    if (this.settings.inputMode === 'auto' || this.closed) return false;
    if (value) {
      if (
        !this.stream ||
        this.activeResponse ||
        this.playing ||
        this.awaitingReply ||
        this.releaseTimer
      )
        return false;
      this.send({ type: 'input_audio_buffer.clear' });
      this.pressedAt = Date.now();
      this.syncInput();
      return true;
    }
    if (!this.pressedAt) return false;
    const duration = Date.now() - this.pressedAt;
    this.pressedAt = 0;
    this.syncInput();
    if (cancel || duration < 250) {
      this.send({ type: 'input_audio_buffer.clear' });
      return false;
    }
    this.awaitingReply = true;
    // Allow the tail of the RTP audio to arrive before committing over the data channel.
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      if (this.closed) return;
      this.send({ type: 'input_audio_buffer.commit' });
      this.send({ type: 'response.create' });
    }, 180);
    return false;
  }
  constructor(
    private cb: LiveCallbacks,
    private settings: VoiceSettings,
  ) {
    this.toolRunner = new RealtimeTools(
      (...args) => this.cb.onTool(...args),
      (event) => this.send(event),
    );
  }
  unlockAudio() {
    if (!this.player) {
      this.player = new Audio();
      this.player.autoplay = true;
    }
    void this.player.play().catch(() => {});
  }
  setMuted(value: boolean) {
    this.muted = value;
    if (this.player) {
      this.player.muted = value;
      if (!value) void this.player.play().catch(() => {});
    }
  }
  private send(event: unknown) {
    if (this.dc?.readyState === 'open' && !this.closed)
      this.dc.send(JSON.stringify(event));
  }
  async connect(history = '') {
    this.cb.onState('Connecting…');
    this.unlockAudio();
    const pc = (this.pc = new RTCPeerConnection());
    this.sender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
    pc.ontrack = (e) => {
      if (this.player) {
        this.player.srcObject = e.streams[0];
        this.player.muted = this.muted;
        void this.player
          .play()
          .catch(() =>
            this.cb.onError('Tap the sound button to enable audio.'),
          );
      }
    };
    pc.onconnectionstatechange = () => {
      if (
        !this.closed &&
        ['failed', 'disconnected'].includes(pc.connectionState)
      ) {
        this.cb.onError('Connection interrupted. Your basket is saved.');
        this.close();
      }
    };
    const dc = (this.dc = pc.createDataChannel('oai-events'));
    dc.onmessage = (e) => {
      if (!this.closed)
        try {
          this.onEvent(JSON.parse(e.data));
        } catch {
          this.cb.onError('Could not read a voice response.');
        }
    };
    const ready = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Voice connection timed out.')),
        25000,
      );
      dc.onopen = () => {
        clearTimeout(timeout);
        resolve();
      };
      dc.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Voice connection failed.'));
      };
      this.abort.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(new Error('Connection cancelled.'));
        },
        { once: true },
      );
    });
    // Attach a handler immediately while HTTP negotiation is in progress.
    void ready.catch(() => {});
    try {
      const offerReady = pc.createOffer().then(async (offer) => {
        await pc.setLocalDescription(offer);
        return offer;
      });
      void offerReady.catch(() => {});
      const r = await fetch('/api/voice/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: this.settings }),
        signal: this.abort.signal,
      });
      const credentials = (await r.json()) as any;
      if (!r.ok)
        throw new Error(credentials.error || 'Could not start OpenAI.');
      const offer = await offerReady;
      const answer = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.token}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
        signal: this.abort.signal,
      });
      if (!answer.ok)
        throw new Error('OpenAI voice connection failed. Try another model.');
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: await answer.text(),
      });
      await ready;
      if (this.closed) return;
      if (history)
        this.send({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text:
                  'Previous conversation for context only. Do not repeat any actions:\n' +
                  history.slice(-8000),
              },
            ],
          },
        });
      this.cb.onState('Ready');
      const expireWhenIdle = () => {
        if (
          this.activeResponse ||
          this.playing ||
          this.awaitingReply ||
          this.pressedAt
        ) {
          this.timer = setTimeout(expireWhenIdle, 1000);
          return;
        }
        this.cb.onError('Session ended. Start again to continue.');
        this.close();
      };
      this.timer = setTimeout(expireWhenIdle, 240000);
    } catch (e) {
      this.close();
      throw e;
    }
  }
  sendText(text: string) {
    if (this.dc?.readyState !== 'open')
      throw new Error('Reconnect to send a message.');
    if (this.activeResponse || this.playing || this.awaitingReply)
      throw new Error('Please wait until the assistant finishes.');
    this.awaitingReply = true;
    this.syncInput();
    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });
    this.send({ type: 'response.create' });
  }
  prepareMic(): Promise<void> {
    if (this.stream) return Promise.resolve();
    if (this.micRequest) return this.micRequest;
    this.cb.onState('Allow microphone access');
    this.micRequest = navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      })
      .then((stream) => {
        if (this.closed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        this.stream = stream;
        this.syncInput();
      })
      .finally(() => {
        this.micRequest = null;
      });
    return this.micRequest;
  }
  async startMic() {
    if (this.starting) return;
    this.starting = true;
    try {
      await this.prepareMic();
      if (this.closed || !this.stream) return;
      await this.sender!.replaceTrack(this.stream.getAudioTracks()[0]);
      this.cb.onState('Listening');
    } catch (e) {
      this.stopMic();
      throw e;
    } finally {
      this.starting = false;
    }
  }
  stopMic() {
    this.pressedAt = 0;
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.sender?.replaceTrack(null).catch(() => {});
    if (!this.closed) this.cb.onState('Ready');
  }
  private onEvent(e: any) {
    if (e.type === 'response.created') {
      this.activeResponse = true;
      this.syncInput();
    }
    if (e.type === 'conversation.item.input_audio_transcription.completed')
      this.cb.onText('user', e.transcript || '', true);
    if (e.type === 'response.output_audio_transcript.delta')
      this.cb.onText('assistant', e.delta || '');
    if (e.type === 'response.output_audio_transcript.done')
      this.cb.onText('assistant', '', true);
    if (e.type === 'error') {
      this.awaitingReply = false;
      this.syncInput();
      if (e.error?.code !== 'response_cancel_not_active')
        this.cb.onError(e.error?.message || 'Voice error.');
    }
    const continuing = this.toolRunner.handle(e);
    if (e.type === 'output_audio_buffer.started') {
      this.playing = true;
      this.syncInput();
      this.cb.onSpeaking?.(true);
    }
    if (
      e.type === 'output_audio_buffer.stopped' ||
      e.type === 'output_audio_buffer.cleared'
    ) {
      this.playing = false;
      this.syncInput();
      this.cb.onSpeaking?.(false);
    }
    if (e.type === 'response.done') {
      // Store lifecycle metadata only, never audio or credentials.
      try {
        const events = JSON.parse(
          sessionStorage.getItem('morsel-voice-events') || '[]',
        );
        events.push({
          at: new Date().toISOString(),
          id: e.response.id,
          status: e.response.status,
          details: e.response.status_details,
        });
        sessionStorage.setItem(
          'morsel-voice-events',
          JSON.stringify(events.slice(-30)),
        );
      } catch {}
      if (e.response.status === 'incomplete' || e.response.status === 'failed')
        this.cb.onError('The reply stopped early. Ask me to continue.');
      this.activeResponse = continuing;
      if (!continuing) {
        this.awaitingReply = false;
        this.cb.onTurn();
      }
      this.syncInput();
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.abort.abort();
    if (this.timer) clearTimeout(this.timer);
    this.stopMic();
    this.dc?.close();
    this.pc?.close();
    if (this.player) {
      this.player.pause();
      this.player.srcObject = null;
    }
    this.cb.onState('Disconnected');
  }
}
