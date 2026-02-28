import * as d3 from "d3";
import { normalizeSymbol } from "$lib/format";
import type { EnrichedPosition } from "$lib/etoro-api";

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

export const COLORS = {
  get gain() {
    return cssVar("--color-gain", "#22c55e");
  },
  get loss() {
    return cssVar("--color-loss", "#ef4444");
  },
  get brand() {
    return cssVar("--color-brand", "#6dc77a");
  },
  get border() {
    return cssVar("--color-border", "#2a2d3e");
  },
  get surface() {
    return cssVar("--color-surface-raised", "#181a24");
  },
  get surfaceOverlay() {
    return cssVar("--color-surface-overlay", "#1e2130");
  },
  get textPrimary() {
    return cssVar("--color-text-primary", "#e8eaed");
  },
  get textSecondary() {
    return cssVar("--color-text-secondary", "#9ca3af");
  },
};

export const pnlColorScale = d3
  .scaleLinear<string>()
  .domain([-30, 0, 30])
  .range([COLORS.loss, COLORS.surfaceOverlay, COLORS.gain])
  .clamp(true);

export const categoryColors = d3.scaleOrdinal(d3.schemeTableau10);

export function symbolColor(
  symbol: string,
  logoColorMap?: Map<string, string>,
): string {
  return logoColorMap?.get(symbol) ?? categoryColors(symbol);
}

export type SymbolSummary = {
  symbol: string;
  logoUrl?: string;
  totalAmount: number;
  totalPnl: number;
  avgPnlPct: number;
  positions: EnrichedPosition[];
};

export function groupBySymbol(positions: EnrichedPosition[]): SymbolSummary[] {
  const map = new Map<string, EnrichedPosition[]>();
  for (const p of positions) {
    const sym = normalizeSymbol(p.symbol ?? `#${p.instrumentId}`);
    if (!map.has(sym)) map.set(sym, []);
    map.get(sym)!.push(p);
  }
  return [...map.entries()].map(([symbol, pos]) => {
    const totalAmount = pos.reduce((s, p) => s + p.amount, 0);
    const totalPnl = pos.reduce((s, p) => s + (p.pnl ?? 0), 0);
    return {
      symbol,
      logoUrl: pos.find((p) => p.logoUrl)?.logoUrl,
      totalAmount,
      totalPnl,
      avgPnlPct: totalAmount > 0 ? (totalPnl / totalAmount) * 100 : 0,
      positions: pos,
    };
  });
}

// --- Logo color sampling with OKLCH normalization ---

const TARGET_L = 0.79;
const MIN_C = 0.25;
const MAX_C = 0.4;

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function linearRgbToOklch(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  // sRGB linear → LMS (via OKLab M1 matrix)
  const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const lc = Math.cbrt(l_);
  const mc = Math.cbrt(m_);
  const sc = Math.cbrt(s_);

  // LMS cuberoot → OKLab
  const L = 0.2104542553 * lc + 0.793617785 * mc - 0.0040720468 * sc;
  const a = 1.9779984951 * lc - 2.428592205 * mc + 0.4505937099 * sc;
  const bVal = 0.0259040371 * lc + 0.7827717662 * mc - 0.808675766 * sc;

  const C = Math.sqrt(a * a + bVal * bVal);
  const H = ((Math.atan2(bVal, a) * 180) / Math.PI + 360) % 360;

  return [L, C, H];
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // OKLab → LMS cuberoot
  const lc = L + 0.3963377774 * a + 0.2158037573 * b;
  const mc = L - 0.1055613458 * a - 0.0638541728 * b;
  const sc = L - 0.0894841775 * a - 1.291485548 * b;

  // LMS cuberoot → linear sRGB
  const l_ = lc * lc * lc;
  const m_ = mc * mc * mc;
  const s_ = sc * sc * sc;

  const lr = +4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const lg = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const lb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;

  return [
    Math.round(Math.min(255, Math.max(0, linearToSrgb(lr) * 255))),
    Math.round(Math.min(255, Math.max(0, linearToSrgb(lg) * 255))),
    Math.round(Math.min(255, Math.max(0, linearToSrgb(lb) * 255))),
  ];
}

const MIN_HUE_GAP = 50;

type OklchTuple = [number, number, number]; // [L, C, H]

function oklchToRgbString(L: number, C: number, H: number): string {
  const clamped = Math.min(Math.max(C, MIN_C), MAX_C);
  const [r, g, b] = oklchToRgb(L, clamped, H);
  return `rgb(${r},${g},${b})`;
}

function deconflictHues(
  entries: { symbol: string; oklch: OklchTuple }[],
): void {
  const n = entries.length;
  if (n <= 1) return;

  const gap = Math.min(MIN_HUE_GAP, 360 / n);

  for (let pass = 0; pass < 12; pass++) {
    entries.sort((a, b) => a.oklch[2] - b.oklch[2]);
    let moved = false;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const hi = entries[i].oklch[2];
      const hj = entries[j].oklch[2];
      const diff = (hj - hi + 360) % 360;

      if (diff < gap) {
        const push = (gap - diff) / 2 + 0.1;
        entries[i].oklch[2] = (((hi - push) % 360) + 360) % 360;
        entries[j].oklch[2] = (hj + push) % 360;
        moved = true;
      }
    }

    if (!moved) break;
  }
}

const logoRgbCache = new Map<string, [number, number, number] | null>();

function sampleLogoRgb(url: string): Promise<[number, number, number] | null> {
  if (logoRgbCache.has(url)) return Promise.resolve(logoRgbCache.get(url)!);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0,
          g = 0,
          b = 0,
          n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i],
            pg = data[i + 1],
            pb = data[i + 2],
            pa = data[i + 3];
          if (pa < 100) continue;
          const lum = (pr + pg + pb) / 3;
          if (lum < 25 || lum > 230) continue;
          r += pr;
          g += pg;
          b += pb;
          n++;
        }
        if (n === 0) {
          logoRgbCache.set(url, null);
          resolve(null);
          return;
        }
        const avg: [number, number, number] = [r / n, g / n, b / n];
        logoRgbCache.set(url, avg);
        resolve(avg);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      logoRgbCache.set(url, null);
      resolve(null);
    };
    img.src = url;
  });
}

export async function buildLogoColorMap(
  positions: EnrichedPosition[],
): Promise<Map<string, string>> {
  const groups = groupBySymbol(positions);

  const samples: { symbol: string; rgb: [number, number, number] }[] = [];
  const pending: Promise<void>[] = [];
  for (const g of groups) {
    if (!g.logoUrl) continue;
    const sym = g.symbol;
    const url = g.logoUrl;
    pending.push(
      sampleLogoRgb(url).then((rgb) => {
        if (rgb) samples.push({ symbol: sym, rgb });
      }),
    );
  }
  await Promise.all(pending);

  const entries = samples.map((s) => ({
    symbol: s.symbol,
    oklch: linearRgbToOklch(s.rgb[0], s.rgb[1], s.rgb[2]) as OklchTuple,
  }));

  deconflictHues(entries);

  const result = new Map<string, string>();
  for (const e of entries) {
    result.set(e.symbol, oklchToRgbString(TARGET_L, e.oklch[1], e.oklch[2]));
  }
  return result;
}
