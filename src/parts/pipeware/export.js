import { PIPEWARE_METADATA } from "./metadata.js";

function shortHash(text) {
	let hash = 2166136261;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}

function formatFilenameNumber(value, fallback = 0) {
	const number = Number(value);
	const normalized = Number.isFinite(number) ? number : fallback;
	return String(Math.round(normalized * 1000) / 1000).replaceAll(".", "p");
}

export function buildPipewareExportFilename(config, formatMeta) {
	const boardWidth = Math.max(1, Math.round(Number(config.width) || 1));
	const boardHeight = Math.max(1, Math.round(Number(config.height) || 1));
	const innerHeight = formatFilenameNumber(
		config.pipewareBoardThicknessValue,
		14.6,
	);
	const hash = shortHash(
		JSON.stringify({
			placements: config.pipewarePlacements ?? [],
			activeFeatureConfig: config.pipewareActiveFeatureConfig ?? null,
		}),
	);

	return `${PIPEWARE_METADATA.slug}_${boardWidth}x${boardHeight}_h${innerHeight}_${hash}.${formatMeta.extension}`;
}
