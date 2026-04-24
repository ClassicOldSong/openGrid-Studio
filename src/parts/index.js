import { OPEN_GRID_BOARD_METADATA } from "./opengrid-board/metadata.js";
import { UNDERWARE_METADATA } from "./underware/metadata.js";

export const PART_METADATA_DEFINITIONS = Object.freeze([
	OPEN_GRID_BOARD_METADATA,
	UNDERWARE_METADATA,
]);
export const DEFAULT_PART_ID = OPEN_GRID_BOARD_METADATA.id;

const PART_METADATA_BY_ID = new Map(
	PART_METADATA_DEFINITIONS.map((metadata) => [metadata.id, metadata]),
);
const PART_LOAD_CACHE = new Map();

export function getPartMetadata(partId = DEFAULT_PART_ID) {
	return PART_METADATA_BY_ID.get(partId) ?? PART_METADATA_BY_ID.get(DEFAULT_PART_ID);
}

export function listPartMetadata() {
	return PART_METADATA_DEFINITIONS;
}

export async function loadPartDefinition(partId = DEFAULT_PART_ID) {
	const metadata = getPartMetadata(partId);
	if (!PART_LOAD_CACHE.has(metadata.id)) {
		PART_LOAD_CACHE.set(metadata.id, Promise.resolve().then(() => metadata.load()));
	}
	return await PART_LOAD_CACHE.get(metadata.id);
}

export async function warmPartRenderer(partId = DEFAULT_PART_ID) {
	const part = await loadPartDefinition(partId);
	await part.renderer.warm();
}

export async function renderPartPreviewMesh(
	partId = DEFAULT_PART_ID,
	config,
) {
	const part = await loadPartDefinition(partId);
	return await part.renderer.renderPreviewMesh(config);
}

export async function renderPartExport(
	partId = DEFAULT_PART_ID,
	config,
	format,
) {
	const part = await loadPartDefinition(partId);
	return await part.renderer.renderExport(config, format);
}
