const LOCALE = "en-US";

export const currency = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
});

export const percent = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const shortDate = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export const monthYear = new Intl.DateTimeFormat(LOCALE, {
  month: "long",
  year: "numeric",
});

export function pnlColor(value: number | undefined): string {
  if (value === undefined) return "text-text-secondary";
  return value >= 0 ? "text-gain" : "text-loss";
}

export function pnlSign(value: number | undefined): string {
  if (value === undefined) return "";
  return value >= 0 ? "+" : "";
}

export function normalizeSymbol(s: string): string {
  return s.replace(/\.RTH$/i, "");
}
