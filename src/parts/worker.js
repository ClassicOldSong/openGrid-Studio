import { OPEN_GRID_BOARD_PART_ID } from "./opengrid-board/metadata.js";
import { PIPEWARE_PART_ID } from "./pipeware/metadata.js";

export const DEFAULT_WORKER_PART_ID = OPEN_GRID_BOARD_PART_ID;

const WORKER_PART_LOADERS = new Map([
	[
		OPEN_GRID_BOARD_PART_ID,
		() =>
			import("./opengrid-board/worker.js").then(
				(module) => module.OPEN_GRID_BOARD_WORKER_PART,
			),
	],
	[
		PIPEWARE_PART_ID,
		() =>
			import("./pipeware/worker.js").then(
				(module) => module.PIPEWARE_WORKER_PART,
			),
	],
]);

const WORKER_PART_LOAD_CACHE = new Map();

export async function loadWorkerPartDefinition(
	partId = DEFAULT_WORKER_PART_ID,
) {
	const loader =
		WORKER_PART_LOADERS.get(partId) ??
		WORKER_PART_LOADERS.get(DEFAULT_WORKER_PART_ID);
	if (!WORKER_PART_LOAD_CACHE.has(partId)) {
		WORKER_PART_LOAD_CACHE.set(partId, Promise.resolve().then(() => loader()));
	}
	return await WORKER_PART_LOAD_CACHE.get(partId);
}

export async function warmWorkerPartRenderer(partId = DEFAULT_WORKER_PART_ID) {
	const part = await loadWorkerPartDefinition(partId);
	await part.renderer.warm();
}

export async function renderWorkerPartPreviewMesh(
	partId = DEFAULT_WORKER_PART_ID,
	config,
) {
	const part = await loadWorkerPartDefinition(partId);
	return await part.renderer.renderPreviewMesh(config);
}

export async function renderWorkerPartExport(
	partId = DEFAULT_WORKER_PART_ID,
	config,
	format,
) {
	const part = await loadWorkerPartDefinition(partId);
	return await part.renderer.renderExport(config, format);
}

