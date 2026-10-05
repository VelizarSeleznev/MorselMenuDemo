'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Language } from './voice-settings';
import translations from './translations.json';
const Context = createContext({
  language: 'en' as Language,
  setLanguage: (_v: Language) => {},
  t: (s: string) => s,
});
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [language, setLocale] = useState<Language>('en');
  useEffect(() => {
    try {
      const s = JSON.parse(
        localStorage.getItem('morsel-voice-settings') || '{}',
      );
      if (['en', 'da', 'ru'].includes(s.language)) setLocale(s.language);
    } catch {}
  }, []);
  function setLanguage(v: Language) {
    setLocale(v);
    try {
      const s = JSON.parse(
        localStorage.getItem('morsel-voice-settings') || '{}',
      );
      localStorage.setItem(
        'morsel-voice-settings',
        JSON.stringify({ ...s, language: v }),
      );
    } catch {}
  }
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const t = (s: string) =>
    language === 'en'
      ? s
      : (translations as Record<string, Record<string, string>>)[s]?.[
          language
        ] || s;
  return (
    <Context.Provider value={{ language, setLanguage, t }}>
      {children}
    </Context.Provider>
  );
}
export const useLocale = () => useContext(Context);
