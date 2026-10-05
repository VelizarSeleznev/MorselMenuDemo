export const languages = { en: 'English', da: 'Dansk', ru: 'Русский' } as const;
export type Language = keyof typeof languages;
export const voiceModels = {
  'gemini-3.8-live': {
    label: 'Gemini 3.8 Live',
    provider: 'gemini',
    voices: [
      'Aoede',
      'Achernar',
      'Achird',
      'Algenib',
      'Algieba',
      'Alnilam',
      'Autonoe',
      'Callirrhoe',
      'Charon',
      'Despina',
      'Enceladus',
      'Erinome',
      'Fenrir',
      'Gacrux',
      'Iapetus',
      'Kore',
      'Laomedeia',
      'Leda',
      'Orus',
      'Puck',
      'Pulcherrima',
      'Rasalgethi',
      'Sadachbia',
      'Sadaltager',
      'Schedar',
      'Sulafat',
      'Umbriel',
      'Vindemiatrix',
      'Zephyr',
      'Zubenelgenubi',
    ],
  },
  'gpt-realtime-2.1-mini': {
    label: 'OpenAI Realtime 2.1 Mini',
    provider: 'openai',
    voices: [
      'marin',
      'cedar',
      'alloy',
      'ash',
      'ballad',
      'coral',
      'echo',
      'sage',
      'shimmer',
      'verse',
    ],
  },
  'gpt-realtime-2.1': {
    label: 'OpenAI Realtime 2.1',
    provider: 'openai',
    voices: [
      'marin',
      'cedar',
      'alloy',
      'ash',
      'ballad',
      'coral',
      'echo',
      'sage',
      'shimmer',
      'verse',
    ],
  },
} as const;
export type VoiceSettings = {
  language: Language;
  model: keyof typeof voiceModels;
  voice: string;
  inputMode?: 'hold' | 'auto';
};
export const defaultSettings: VoiceSettings = {
  language: 'en',
  model: 'gemini-3.8-live',
  voice: 'Aoede',
  inputMode: 'hold',
};
export function validSettings(v: any): v is VoiceSettings {
  return (
    !!v &&
    (v.inputMode === undefined ||
      v.inputMode === 'hold' ||
      v.inputMode === 'auto') &&
    Object.hasOwn(languages, v.language) &&
    Object.hasOwn(voiceModels, v.model) &&
    (
      voiceModels[v.model as keyof typeof voiceModels]
        .voices as readonly string[]
    ).includes(v.voice)
  );
}
export function languageInstruction(language: Language) {
  return `The guest selected ${languages[language]}. Speak and write ALL conversation replies in this language unless they explicitly request a change. This overrides any earlier default-language instruction. Keep dish IDs unchanged.`;
}
