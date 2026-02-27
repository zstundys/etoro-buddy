import * as d3 from 'd3';
import { normalizeSymbol } from '$lib/format';
import type { EnrichedPosition } from '$lib/etoro';

export const COLORS = {
	gain: '#22c55e',
	loss: '#ef4444',
	brand: '#6dc77a',
	border: '#2a2d3e',
	surface: '#181a24',
	surfaceOverlay: '#1e2130',
	textPrimary: '#e8eaed',
	textSecondary: '#9ca3af'
};

export const pnlColorScale = d3
	.scaleLinear<string>()
	.domain([-30, 0, 30])
	.range([COLORS.loss, COLORS.surfaceOverlay, COLORS.gain])
	.clamp(true);

export const categoryColors = d3.scaleOrdinal(d3.schemeTableau10);

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
			positions: pos
		};
	});
}

// --- Logo color sampling ---

const logoColorCache = new Map<string, string>();

export function sampleLogoColor(url: string): Promise<string | null> {
	if (logoColorCache.has(url)) return Promise.resolve(logoColorCache.get(url)!);
	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			try {
				const canvas = document.createElement('canvas');
				canvas.width = 16;
				canvas.height = 16;
				const ctx = canvas.getContext('2d');
				if (!ctx) { resolve(null); return; }
				ctx.drawImage(img, 0, 0, 16, 16);
				const data = ctx.getImageData(0, 0, 16, 16).data;
				let r = 0, g = 0, b = 0, n = 0;
				for (let i = 0; i < data.length; i += 4) {
					const pr = data[i], pg = data[i + 1], pb = data[i + 2], pa = data[i + 3];
					if (pa < 100) continue;
					const lum = (pr + pg + pb) / 3;
					if (lum < 25 || lum > 230) continue;
					r += pr; g += pg; b += pb; n++;
				}
				if (n === 0) { resolve(null); return; }
				const color = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
				logoColorCache.set(url, color);
				resolve(color);
			} catch {
				resolve(null);
			}
		};
		img.onerror = () => resolve(null);
		img.src = url;
	});
}

export async function buildLogoColorMap(positions: EnrichedPosition[]): Promise<Map<string, string>> {
	const groups = groupBySymbol(positions);
	const result = new Map<string, string>();
	const pending: Promise<void>[] = [];
	for (const g of groups) {
		if (!g.logoUrl) continue;
		const sym = g.symbol;
		const url = g.logoUrl;
		pending.push(
			sampleLogoColor(url).then((color) => {
				if (color) result.set(sym, color);
			})
		);
	}
	await Promise.all(pending);
	return result;
}
