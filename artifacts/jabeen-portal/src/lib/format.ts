import i18n from "@/i18n";

// Latin digits in Arabic for finance/IDs; switch to "ar-SA" to use Arabic-Indic digits.
const locale = () => (i18n.resolvedLanguage === "ar" ? "ar-SA-u-nu-latn" : "en-US");

export const fmtNumber = (n: number) => new Intl.NumberFormat(locale()).format(n);
export const fmtPercent = (n: number) =>
  new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: 0 }).format(n / 100);
export const fmtDate = (d: Date | string) =>
  new Intl.DateTimeFormat(locale(), { dateStyle: "medium" }).format(new Date(d));
export const fmtDateTime = (d: Date | string) =>
  new Intl.DateTimeFormat(locale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
export const fmtTime = (d: Date | string) =>
  new Intl.DateTimeFormat(locale(), { timeStyle: "short" }).format(new Date(d));
