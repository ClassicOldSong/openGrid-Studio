import { OPEN_GRID_BOARD_PART } from "./opengrid-board/index.js";

export const PART_DEFINITIONS = Object.freeze([OPEN_GRID_BOARD_PART]);
export const DEFAULT_PART_ID = OPEN_GRID_BOARD_PART.id;

const PARTS_BY_ID = new Map(PART_DEFINITIONS.map((part) => [part.id, part]));

export function getPartDefinition(partId = DEFAULT_PART_ID) {
	return PARTS_BY_ID.get(partId) ?? PARTS_BY_ID.get(DEFAULT_PART_ID);
}

export function listPartMetadata() {
	return PART_DEFINITIONS.map((part) => part.metadata);
}

export async function warmPartRenderer(partId = DEFAULT_PART_ID) {
	await getPartDefinition(partId).renderer.warm();
}

export async function renderPartPreviewMesh(
	partId = DEFAULT_PART_ID,
	config,
) {
	return await getPartDefinition(partId).renderer.renderPreviewMesh(config);
}

export async function renderPartExport(
	partId = DEFAULT_PART_ID,
	config,
	format,
) {
	return await getPartDefinition(partId).renderer.renderExport(config, format);
}
