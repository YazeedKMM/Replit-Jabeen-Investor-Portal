import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import ar from "./locales/ar.json";
import en from "./locales/en.json";

export const LANGS = ["ar", "en"] as const;
export type Lang = (typeof LANGS)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { ar: { translation: ar }, en: { translation: en } },
    fallbackLng: "ar",
    supportedLngs: LANGS,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "htmlTag"],
      lookupLocalStorage: "jabeen_lang",
      caches: ["localStorage"],
    },
  });

export default i18n;
