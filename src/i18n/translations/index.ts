import { Language, TranslationSchema } from '../types';
import { en } from './en';
import { ta } from './ta';
import { hi } from './hi';
import { ml } from './ml';
import { te } from './te';
import { kn } from './kn';
import { or } from './or';

export const translations: Record<Language, TranslationSchema> = {
  en,
  ta,
  hi,
  ml,
  te,
  kn,
  or,
};

export function getTranslation(lang: Language): TranslationSchema {
  return translations[lang] || translations.en;
}
