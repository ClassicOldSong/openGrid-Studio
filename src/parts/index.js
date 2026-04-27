import { OPEN_GRID_BOARD_METADATA } from "./opengrid-board/metadata.js";
import { PIPEWARE_METADATA } from "./pipeware/metadata.js";

export const PART_METADATA_DEFINITIONS = Object.freeze([
	OPEN_GRID_BOARD_METADATA,
	PIPEWARE_METADATA,
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
