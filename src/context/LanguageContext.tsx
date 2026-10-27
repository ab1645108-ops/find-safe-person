import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, LanguageOption, SUPPORTED_LANGUAGES, TranslationSchema } from '../i18n/types';
import { translations, getTranslation } from '../i18n/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  dict: TranslationSchema;
  t: (path: string, fallback?: string) => string;
  languages: LanguageOption[];
}

const STORAGE_KEY = 'findsafe_language';

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (saved && (saved === 'en' || saved === 'ta' || saved === 'hi' || saved === 'ml' || saved === 'te' || saved === 'kn' || saved === 'or')) {
        return saved;
      }
    } catch {
      // localStorage may fail in restricted iframes
    }
    return 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore storage write errors
    }
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const dict = getTranslation(language);
  const fallbackDict = translations.en;

  // Safe nested path resolver: e.g. "nav.cases" -> dict.nav.cases
  const t = (path: string, fallback?: string): string => {
    if (!path) return fallback || '';
    const parts = path.split('.');
    
    // Attempt lookup in current language
    let current: unknown = dict;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        current = undefined;
        break;
      }
    }

    if (typeof current === 'string' && current.length > 0) {
      return current;
    }

    // Attempt lookup in English fallback
    let fallbackValue: unknown = fallbackDict;
    for (const part of parts) {
      if (fallbackValue && typeof fallbackValue === 'object' && part in fallbackValue) {
        fallbackValue = (fallbackValue as Record<string, unknown>)[part];
      } else {
        fallbackValue = undefined;
        break;
      }
    }

    if (typeof fallbackValue === 'string' && fallbackValue.length > 0) {
      return fallbackValue;
    }

    return fallback || path;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        dict,
        t,
        languages: SUPPORTED_LANGUAGES,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
