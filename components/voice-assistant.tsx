'use client';
import { useLocale } from '@/lib/i18n';
import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  Mic,
  X,
  ArrowRight,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  Plus,
  ShoppingBag,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { MenuLiveClient, type VoiceClient } from '@/lib/live-client';
import { OpenAILiveClient } from '@/lib/openai-live-client';
import {
  languages,
  voiceModels,
  defaultSettings,
  validSettings,
  type VoiceSettings,
} from '@/lib/voice-settings';
export type VoiceAssistantHandle = {
  start: () => void;
  settings: () => void;
  reset: () => void;
};
import {
  executeMenuTool,
  initialMenuSnapshot,
  type BasketLine,
  type MenuContext,
} from '@/lib/assistant';
import {
  menu,
  variantFor,
  priceFor,
  type Portion,
  type Dish,
} from '@/lib/menu';
import { appendTranscript } from '@/lib/transcript';
type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  getContext: () => MenuContext;
  onBasket: (basket: BasketLine[]) => void;
  onRecommendations: (items: { id: string; portion: Portion }[]) => void;
  onDish: (dish: Dish, p: Portion) => void;
  onAdd: (id: string, p: Portion) => void;
  onShowBasket: () => void;
};
type Message = {
  streamId?: string;
  role: 'user' | 'assistant';
  text: string;
  items?: {
    id: string;
    portion: Portion;
  }[];
};
const VoiceAssistant = forwardRef<VoiceAssistantHandle, Props>(
  function VoiceAssistant(
    {
      open,
      onOpenChange,
      getContext,
      onBasket,
      onRecommendations,
      onDish,
      onAdd,
      onShowBasket,
    },
    ref,
  ) {
    const { language, setLanguage, t } = useLocale();
    useEffect(() => {
      stop();
      setSettings((s) => ({ ...s, language }));
      setChosenLanguage(true);
    }, [language]);
    const [settings, setSettings] = useState<VoiceSettings>(defaultSettings);
    const [chosenLanguage, setChosenLanguage] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [restart, setRestart] = useState(0);
    const [archives, setArchives] = useState<
      {
        id: string;
        label: string;
        messages: Message[];
      }[]
    >([]);
    const [chatId, setChatId] = useState('initial');
    useEffect(() => {
      if (chatId !== 'initial')
        try {
          sessionStorage.setItem('morsel-active-chat', chatId);
        } catch {}
    }, [chatId]);
    useImperativeHandle(ref, () => ({
      start: () => {
        onOpenChange(true);
        if (chosenLanguage) void toggleMicStart();
      },
      reset: () => {
        stop();
        setMessages([]);
        messagesRef.current = [];
        latestUtterance.current = '';
        setArchives([]);
        setChatId(crypto.randomUUID());
        setError('');
        setSettingsOpen(false);
        for (const key of [
          'morsel-chats',
          'morsel-active-chat',
          'morsel-transcript-v1',
        ])
          try {
            sessionStorage.removeItem(key);
          } catch {}
      },
      settings: () => {
        stop();
        setSettingsOpen(true);
      },
    }));
    function saveSettings(next: VoiceSettings) {
      stop();
      setSettings(next);
      setLanguage(next.language);
      setChosenLanguage(true);
      try {
        localStorage.setItem('morsel-voice-settings', JSON.stringify(next));
      } catch {}
      setSettingsOpen(false);
      if (open) setRestart((n) => n + 1);
    }
    function archiveCurrent() {
      const item = {
        id: chatId,
        label:
          messages.find((m) => m.role === 'user')?.text.slice(0, 45) ||
          new Date().toLocaleTimeString(),
        messages: messages.slice(-200),
      };
      const next = [item, ...archives.filter((a) => a.id !== chatId)].slice(
        0,
        12,
      );
      setArchives(next);
      try {
        sessionStorage.setItem('morsel-chats', JSON.stringify(next));
      } catch {}
      return next;
    }
    function newChat() {
      stop();
      archiveCurrent();
      setChatId(crypto.randomUUID());
      setMessages([]);
      messagesRef.current = [];
      latestUtterance.current = '';
      setError('');
      setRestart((n) => n + 1);
    }
    function switchChat(id: string) {
      const target = archives.find((a) => a.id === id);
      if (!target) return;
      stop();
      archiveCurrent();
      setChatId(target.id);
      setMessages(target.messages);
      messagesRef.current = target.messages;
      latestUtterance.current = '';
      setError('');
      setRestart((n) => n + 1);
    }
    async function toggleMicStart() {
      if (!mic && !micPending.current) await toggleMic();
    }
    useEffect(() => {
      if (restart && open && chosenLanguage) void toggleMicStart();
    }, [restart]);
    const [showTranscript, setShowTranscript] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const [textEntry, setTextEntry] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const latestRecommendation = [...messages].reverse().find((m) => m.items);
    const recommendationCallback = useRef(onRecommendations);
    recommendationCallback.current = onRecommendations;
    useEffect(() => {
      recommendationCallback.current(latestRecommendation?.items || []);
    }, [latestRecommendation]);
    const messagesRef = useRef(messages);
    messagesRef.current = messages;
    const [input, setInput] = useState('');
    const [status, setStatus] = useState('Ready when you are');
    const [error, setError] = useState('');
    const [mic, setMic] = useState(false);
    const [micBusy, setMicBusy] = useState(false);
    const [holding, setHolding] = useState(false);
    const holdRef = useRef(false);
    const holdMode = settings.inputMode !== 'auto';
    function beginHold() {
      if (holdRef.current) return;
      const accepted = live.current?.setInputActive(true) || false;
      holdRef.current = accepted;
      setHolding(accepted);
    }
    function endHold(cancel = false) {
      if (!holdRef.current) return;
      holdRef.current = false;
      setHolding(false);
      live.current?.setInputActive(false, cancel);
    }
    useEffect(() => {
      const release = () => endHold(true);
      window.addEventListener('blur', release);
      document.addEventListener('visibilitychange', release);
      return () => {
        window.removeEventListener('blur', release);
        document.removeEventListener('visibilitychange', release);
      };
    }, []);

    const micPending = useRef(false);
    const [busy, setBusy] = useState(false);
    const [voice, setVoice] = useState(true);
    const live = useRef<VoiceClient | null>(null);
    const connecting = useRef<Promise<VoiceClient> | null>(null);
    const end = useRef<HTMLDivElement>(null);
    const latest = useRef({ getContext, onBasket });
    latest.current = { getContext, onBasket };
    const latestUtterance = useRef('');
    const partial = useRef<Partial<Record<'user' | 'assistant', string>>>({});
    const [restored, setRestored] = useState(false);
    useEffect(() => {
      try {
        const active = sessionStorage.getItem('morsel-active-chat');
        if (active) setChatId(active);
        const prefs = JSON.parse(
          localStorage.getItem('morsel-voice-settings') || 'null',
        );
        if (prefs?.model === 'gemini-3.1-flash-live-preview') prefs.model = 'gemini-3.8-live';
        if (validSettings(prefs)) {
          setSettings(prefs);
          setChosenLanguage(true);
        }
        const old = JSON.parse(sessionStorage.getItem('morsel-chats') || '[]');
        if (Array.isArray(old))
          setArchives(
            old
              .filter(
                (a) =>
                  a &&
                  typeof a.id === 'string' &&
                  typeof a.label === 'string' &&
                  Array.isArray(a.messages),
              )
              .slice(0, 12),
          );
      } catch {}
      try {
        const saved = JSON.parse(
          sessionStorage.getItem('morsel-transcript-v1') || 'null',
        );
        if (Array.isArray(saved) && saved.length) {
          const safe = saved
            .filter(
              (m) =>
                m &&
                ['user', 'assistant'].includes(m.role) &&
                typeof m.text === 'string',
            )
            .slice(-200)
            .map((m) => ({
              role: m.role as 'user' | 'assistant',
              text: m.text.slice(0, 12000),
            }));
          if (safe.length) setMessages(safe);
        }
      } catch {}
      setRestored(true);
    }, []);
    useEffect(() => {
      if (restored)
        try {
          sessionStorage.setItem(
            'morsel-transcript-v1',
            JSON.stringify(
              messages.slice(-200).map(({ role, text }) => ({ role, text })),
            ),
          );
        } catch {}
    }, [messages, restored]);
    const generation = useRef(0);
    const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
    function clearWatchdog() {
      if (watchdog.current) clearTimeout(watchdog.current);
      watchdog.current = null;
    }
    function stop() {
      holdRef.current = false;
      setHolding(false);
      generation.current++;
      partial.current = {};
      live.current?.close();
      live.current = null;
      connecting.current = null;
      setMic(false);
      setSpeaking(false);
      setMicBusy(false);
      micPending.current = false;
      setBusy(false);
      setStatus('Ready when you are');
      clearWatchdog();
    }
    useEffect(() => {
      if (!open) stop();
      return () => {};
    }, [open]);
    useEffect(
      () => () => {
        live.current?.close();
        clearWatchdog();
      },
      [],
    );
    useEffect(() => {
      if (showTranscript) end.current?.scrollIntoView({ block: 'nearest' });
    }, [messages, showTranscript]);
    function append(
      role: 'user' | 'assistant',
      text: string,
      finished = false,
    ) {
      if (role === 'user' && text)
        latestUtterance.current = partial.current.user
          ? latestUtterance.current + text
          : text;
      const id = partial.current[role] || crypto.randomUUID();
      partial.current[role] = id;
      setMessages((old) => appendTranscript(old, role, text, id) as Message[]);
      if (finished) delete partial.current[role];
    }
    function downloadTranscript() {
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              {
                exportedAt: new Date().toISOString(),
                note: 'Automatic captions may contain recognition errors. Audio is not recorded.',
                messages: messages.map(({ role, text }) => ({ role, text })),
              },
              null,
              2,
            ),
          ],
          { type: 'application/json' },
        ),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'morsel-transcript.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    async function ensure() {
      if (live.current && !connecting.current) return live.current;
      if (connecting.current) return connecting.current;
      const currentGeneration = generation.current;
      const Client =
        voiceModels[settings.model].provider === 'openai'
          ? OpenAILiveClient
          : MenuLiveClient;
      const client = new Client(
        {
          onSpeaking: (v) => {
            if (generation.current === currentGeneration) setSpeaking(v);
          },
          onText: (role, text, finished) => {
            if (generation.current === currentGeneration)
              append(role, text, finished);
          },
          onTurn: () => {
            if (generation.current !== currentGeneration) return;
            partial.current = {};
            setBusy(false);
            clearWatchdog();
          },
          onInterrupt: () => {
            if (generation.current !== currentGeneration) return;
            partial.current = {};
            setBusy(false);
            clearWatchdog();
          },
          onState: (s) => {
            if (generation.current !== currentGeneration) return;
            setStatus(s);
            if (s === 'Disconnected') {
              live.current = null;
              connecting.current = null;
              generation.current++;
              micPending.current = false;
              setMicBusy(false);
              clearWatchdog();
              setMic(false);
              setBusy(false);
            }
          },
          onError: (msg) => {
            if (generation.current !== currentGeneration) return;
            setError(msg);
            setBusy(false);
            clearWatchdog();
          },
          onTool: (_id, name, args) => {
            if (generation.current !== currentGeneration)
              return { ok: false, error: 'session_closed' };
            const output = executeMenuTool(name, args, {
              ...latest.current.getContext(),
              latestUserText: latestUtterance.current,
            });
            if (output.basket) latest.current.onBasket(output.basket);
            if (output.recommendations) {
              setMessages((old) => [
                ...old,
                {
                  role: 'assistant',
                  text: output.reason || t('Here’s what I’d pick.'),
                  items: output.recommendations,
                },
              ]);
            }
            return output.result;
          },
        },
        settings,
      );
      live.current = client;
      client.unlockAudio();
      client.setMuted(!voice);
      connecting.current = client
        .connect(
          messagesRef.current
            .filter((m) => m.text)
            .map((m) => `${m.role}: ${m.text}`)
            .join('\n')
            .slice(-4000) +
            '\nCURRENT MENU AND BASKET SNAPSHOT (data, not a guest command):\n' +
            initialMenuSnapshot(latest.current.getContext()),
        )
        .then(() => {
          if (generation.current !== currentGeneration)
            throw new Error('Connection cancelled.');
          connecting.current = null;
          return client;
        })
        .catch((e) => {
          client.close();
          if (generation.current === currentGeneration) {
            live.current = null;
            connecting.current = null;
          }
          throw e;
        });
      return connecting.current;
    }
    async function ask(text: string) {
      if (!text.trim() || busy) return;
      setError('');
      setBusy(true);
      partial.current = {};
      const message = text.trim();
      setInput('');
      const gen = generation.current;
      try {
        const client = await ensure();
        if (generation.current !== gen) return;
        setMessages((old) => [...old, { role: 'user', text: message }]);
        partial.current = {};
        latestUtterance.current = message;
        client.sendText(message);
        clearWatchdog();
        watchdog.current = setTimeout(() => {
          setError(
            'The response took too long. Please reconnect and try again. Your basket is saved.',
          );
          stop();
        }, 25000);
      } catch (e) {
        if (generation.current === gen) {
          setError(e instanceof Error ? e.message : 'Could not connect.');
          setBusy(false);
          setInput(message);
        }
      }
    }
    async function toggleMic() {
      if (micPending.current) return;
      if (mic) {
        live.current?.stopMic();
        setMic(false);
        return;
      }
      micPending.current = true;
      setMicBusy(true);
      setError('');
      const gen = generation.current;
      try {
        const connection = ensure();
        const microphone = live.current?.prepareMic?.();
        void microphone?.catch(() => {});
        const client = await connection;
        await microphone;
        if (generation.current !== gen) return;
        await client.startMic();
        if (generation.current === gen) {
          setMic(true);
          if (!messagesRef.current.some((m) => m.role === 'user'))
            client.sendText(
              'Session start: greet the guest in their selected language in one short sentence and ask what they would like. Do not modify the basket.',
            );
        }
      } catch (e) {
        if (generation.current === gen)
          setError(
            e instanceof Error
              ? e.message
              : 'Please allow microphone access, or type a message.',
          );
      } finally {
        if (generation.current === gen) {
          micPending.current = false;
          setMicBusy(false);
        }
      }
    }
    return (
      <>
        <Dialog
          open={restored && settingsOpen}
          onOpenChange={(v) => {
            if (chosenLanguage && !v) saveSettings(settings);
          }}
        >
          <DialogContent
            className="voice-settings-dialog"
            showCloseButton={chosenLanguage}
            initialFocus={false}
          >
            {!chosenLanguage && (
              <div className="language-brand" aria-hidden="true">
                {t('morsel')}
                <span>{t('\u2022')}</span>
              </div>
            )}
            <DialogTitle>
              {chosenLanguage ? t('Voice settings') : 'Let’s talk.'}
            </DialogTitle>
            <DialogDescription>
              {chosenLanguage
                ? t('Make yourself comfortable.')
                : 'Choose your conversation language.'}
            </DialogDescription>
            {chosenLanguage && (
              <div className="settings-language-label">
                {t('Conversation language')}
              </div>
            )}
            <div
              className={
                chosenLanguage
                  ? 'settings-language-options'
                  : 'language-options'
              }
            >
              {Object.entries(languages).map(([code, label]) => (
                <button
                  key={code}
                  aria-pressed={
                    chosenLanguage ? settings.language === code : undefined
                  }
                  onClick={() => {
                    const next = {
                      ...settings,
                      language: code as VoiceSettings['language'],
                    };
                    if (chosenLanguage) setSettings(next);
                    else saveSettings(next);
                  }}
                >
                  {chosenLanguage ? (
                    <span lang={code}>{label}</span>
                  ) : (
                    <>
                      <span className="language-copy">
                        <strong lang={code}>{label}</strong>
                        <span lang={code}>
                          {
                            {
                              en: 'Hello, hungry?',
                              da: 'Hej, er du sulten?',
                              ru: 'Привет! Есть аппетит?',
                            }[code as VoiceSettings['language']]
                          }
                        </span>
                      </span>
                      <ArrowRight size={20} aria-hidden="true" />
                    </>
                  )}
                </button>
              ))}
            </div>
            {chosenLanguage && (
              <>
                <label>
                  {t('Voice model')}
                  <select
                    value={settings.model}
                    onChange={(e) => {
                      const model = e.target.value as VoiceSettings['model'];
                      setSettings({
                        ...settings,
                        model,
                        voice: voiceModels[model].voices[0],
                      });
                    }}
                  >
                    {Object.entries(voiceModels).map(([id, m]) => (
                      <option value={id} key={id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('Voice')}
                  <select
                    value={settings.voice}
                    onChange={(e) =>
                      setSettings({ ...settings, voice: e.target.value })
                    }
                  >
                    {voiceModels[settings.model].voices.map((v) => (
                      <option key={v} value={v}>
                        {v.charAt(0).toUpperCase() + v.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  {voiceModels[settings.model].voices.length}{' '}
                  {t('voices available. You can change these anytime.')}
                </p>
              </>
            )}
            {chosenLanguage && (
              <button
                className="primary-button"
                onClick={() => saveSettings(settings)}
              >
                {t('Save settings')}
              </button>
            )}
          </DialogContent>
        </Dialog>
        {open && (
          <aside
            className="assistant-sidebar"
            aria-label={t('Your menu companion')}
          >
            <button
              className="assistant-close"
              aria-label={t('Close')}
              onClick={() => {
                stop();
                onOpenChange(false);
              }}
            >
              <X size={20} />
            </button>
            <div className="assistant-header">
              <div className="assistant-avatar">
                <Sparkles size={25} />
              </div>
              <div>
                <h2 data-slot="dialog-title">{t('Your menu companion')}</h2>
                <p data-slot="dialog-description">
                  {t(
                    holdMode && mic && !holding && status === 'Listening'
                      ? 'Ready'
                      : status,
                  )}
                </p>
              </div>
              <button
                className="sound-toggle"
                aria-label={t(voice ? 'Mute assistant' : 'Unmute assistant')}
                onClick={() => {
                  setVoice(!voice);
                  live.current?.setMuted(voice);
                }}
              >
                {voice ? <Volume2 size={21} /> : <VolumeX size={21} />}
              </button>
            </div>
            {(!showTranscript || holdMode) && (
              <div className="voice-stage">
                <button
                  className={`voice-orb ${speaking ? 'speaking' : (holdMode ? holding : mic) ? 'listening' : ''}`}
                  style={{ touchAction: 'none', userSelect: 'none' }}
                  onClick={() => {
                    if (!holdMode || !mic) void toggleMic();
                  }}
                  onPointerDown={(e) => {
                    if (holdMode && mic) {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      beginHold();
                    }
                  }}
                  onPointerUp={() => endHold()}
                  onPointerCancel={() => endHold(true)}
                  onLostPointerCapture={() => endHold(true)}
                  onKeyDown={(e) => {
                    if (holdMode && mic && [' ', 'Enter'].includes(e.key)) {
                      e.preventDefault();
                      beginHold();
                    }
                  }}
                  onKeyUp={(e) => {
                    if (holdMode && mic && [' ', 'Enter'].includes(e.key)) {
                      e.preventDefault();
                      endHold();
                    }
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  disabled={micBusy || status === 'Connecting…'}
                  aria-label={t(
                    mic
                      ? holdMode
                        ? 'Hold to talk'
                        : 'Stop microphone'
                      : 'Start voice conversation',
                  )}
                >
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </button>
                <h2>
                  {t(
                    speaking
                      ? 'Speaking'
                      : mic
                        ? holdMode
                          ? holding
                            ? 'Release to send'
                            : 'Hold to talk'
                          : 'I’m listening'
                        : status === 'Connecting…'
                          ? 'Connecting…'
                          : micBusy
                            ? 'Allow microphone access'
                            : 'Let’s talk',
                  )}
                </h2>
                <p>
                  {t(
                    mic
                      ? holdMode
                        ? 'The microphone only sends audio while you hold the button.'
                        : 'Speak after the assistant finishes.'
                      : micBusy
                        ? 'Allow microphone access'
                        : 'Tap the microphone to talk.',
                  )}
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    endHold(true);
                    saveSettings({
                      ...settings,
                      inputMode: holdMode ? 'auto' : 'hold',
                    });
                  }}
                >
                  {t(
                    holdMode
                      ? 'Switch to hands-free'
                      : 'Noisy place? Hold to talk',
                  )}
                </button>
              </div>
            )}
            {!showTranscript &&
              [...messages]
                .reverse()
                .find((m) => m.role === 'assistant' && !m.items)?.text && (
                <p className="assistant-caption">
                  {
                    [...messages]
                      .reverse()
                      .find((m) => m.role === 'assistant' && !m.items)?.text
                  }
                </p>
              )}
            <div
              className="chat-scroll"
              hidden={!showTranscript}
              aria-live={showTranscript ? 'polite' : 'off'}
            >
              {messages.map((m, i) => (
                <div className={`message ${m.role}`} key={i}>
                  <p>{m.text}</p>
                  {m.items && (
                    <div className="recommendations">
                      {m.items.map((item) => {
                        const d = menu.find((d) => d.id === item.id)!;
                        return (
                          <div
                            className="recommendation"
                            key={item.id + item.portion}
                          >
                            <button
                              className="recommendation-info"
                              onClick={() => onDish(d, item.portion)}
                            >
                              <strong>{t(d.name)}</strong>
                              <span>
                                {t(variantFor(d, item.portion))}
                                {t('\u00B7')} {priceFor(d, item.portion)}
                                {t('kr')}
                              </span>
                            </button>
                            <button
                              className="recommendation-add"
                              aria-label={`Add ${t(d.name)}`}
                              onClick={() => onAdd(d.id, item.portion)}
                            >
                              <Plus size={20} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              {busy && (
                <p className="assistant-thinking" role="status">
                  {t('Finding something good\u2026')}
                </p>
              )}
              <div ref={end} />
            </div>
            <div className="chat-controls">
              <div className="conversation-tools">
                <button onClick={newChat}>{t('\uFF0B New chat')}</button>
                <select
                  aria-label={t('Previous chats')}
                  value=""
                  onChange={(e) => switchChat(e.target.value)}
                >
                  <option value="">{t('Previous chats')}</option>
                  {archives
                    .filter((a) => a.id !== chatId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => {
                    stop();
                    setSettingsOpen(true);
                  }}
                >
                  {t('\u2699')}
                  {languages[settings.language]}
                </button>
              </div>
              <div className="voice-model-label">
                {voiceModels[settings.model].label}
                {t('\u00B7')}
                {settings.voice}
              </div>
              <div className="transcript-actions" hidden={!showTranscript}>
                <span>
                  {t(
                    'Auto captions \u00B7 may mishear \u00B7 saved in this tab',
                  )}
                </span>
                <button onClick={downloadTranscript}>
                  {t('Save transcript')}
                </button>
              </div>
              <button className="assistant-basket" onClick={onShowBasket}>
                <ShoppingBag size={17} />
                {t('View your basket')}{' '}
                <span>
                  {getContext().basket.reduce((s, l) => s + l.quantity, 0)}{' '}
                  {t('items')}
                </span>
              </button>
              <div className="quick-chips">
                {[
                  'Make me a filling basket',
                  'Something light',
                  'Surprise me',
                  'No meat, please',
                ].map((c) => (
                  <button
                    key={c}
                    disabled={busy || status === 'Connecting…'}
                    onClick={() => ask(t(c))}
                  >
                    {t(c)}
                  </button>
                ))}
              </div>
              {error && (
                <p className="voice-error" role="alert">
                  {language !== 'en' && t(error) === error
                    ? t('Voice connection failed. Please try again.')
                    : t(error)}
                </p>
              )}
              <div className="voice-view-toggle">
                <button onClick={() => setShowTranscript(!showTranscript)}>
                  {t(showTranscript ? 'Hide transcript' : 'Transcript')}
                </button>
                <button onClick={() => setTextEntry(!textEntry)}>
                  {t(textEntry ? 'Hide keyboard' : 'Type instead')}
                </button>
              </div>
              <form
                hidden={!textEntry && !showTranscript}
                className="chat-input"
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask(input);
                }}
              >
                <button
                  type="button"
                  className={`mic-button ${mic ? 'listening' : ''}`}
                  onClick={() => void toggleMic()}
                  disabled={status === 'Connecting…' || micBusy}
                  aria-label={t(
                    mic ? 'Stop microphone' : 'Start voice conversation',
                  )}
                >
                  <Mic size={22} />
                </button>
                <input
                  aria-label={t('Message the assistant')}
                  placeholder={t(
                    mic
                      ? holdMode
                        ? 'Hold to talk'
                        : 'Speak after the assistant finishes.'
                      : 'Type or tap the microphone…',
                  )}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  maxLength={500}
                />
                <button
                  className="send-button"
                  type="submit"
                  disabled={!input.trim() || busy}
                  aria-label={t('Send message')}
                >
                  <Send size={20} />
                </button>
              </form>
              <div className="demo-mode">
                {t('AI voice companion \u00B7')}
                {t(
                  mic
                    ? holdMode && !holding
                      ? 'Hold to talk'
                      : 'Microphone on'
                    : 'Microphone off',
                )}{' '}
                {t('\u00B7 Draft basket only')}
              </div>
            </div>
          </aside>
        )}
      </>
    );
  },
);
export default VoiceAssistant;
