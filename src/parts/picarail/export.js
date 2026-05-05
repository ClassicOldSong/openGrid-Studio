import { PICARAIL_METADATA } from "./metadata.js";
import { getPicaRailConfigSummary } from "./direct-geometry.js";

function shortHash(text) {
	let hash = 2166136261;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}

export function buildPicaRailExportFilename(config = {}, formatMeta) {
	const summary = getPicaRailConfigSummary(config);
	const tileSize = Math.round((summary.tileSize + Number.EPSILON) * 1000) / 1000;
	const tileLength = summary.tileLength;
	const extension =
		formatMeta?.extension ?? (formatMeta === "3mf" ? "3mf" : "stl");
	const hash = shortHash(JSON.stringify(config));

	return `${PICARAIL_METADATA.slug}_tile${tileSize}_length${tileLength}_${hash}.${extension}`;
}
