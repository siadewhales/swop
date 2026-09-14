import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './locales/generated/es.json';
import en from './locales/generated/en.json';

const languageLoaders = import.meta.glob([
  './locales/generated/*.json',
  '!./locales/generated/es.json',
  '!./locales/generated/en.json'
]);
const loadedLanguages = new Set(['es', 'en']);

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en }
  },
  lng: 'es',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
});

export async function ensureLanguage(code) {
  if (loadedLanguages.has(code)) return true;
  const loader = languageLoaders[`./locales/generated/${code}.json`];
  if (!loader) return false;
  const module = await loader();
  i18n.addResourceBundle(code, 'translation', module.default, true, true);
  loadedLanguages.add(code);
  return true;
}

export async function changeAppLanguage(code) {
  const loaded = await ensureLanguage(code);
  await i18n.changeLanguage(loaded ? code : 'en');
}

export default i18n;
