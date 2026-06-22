import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Lang } from "@/i18n";

/** Keeps <html dir lang> synced to the active i18next language and exposes a toggle. */
export function useLanguage() {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? "ar") as Lang;
  const dir: "rtl" | "ltr" = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = (next: Lang) => i18n.changeLanguage(next);
  const toggle = () => setLang(lang === "ar" ? "en" : "ar");
  return { lang, dir, setLang, toggle };
}
