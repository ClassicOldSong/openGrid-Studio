import { PIPEWARE_PART_ID } from "./metadata.js";
import {
	renderPipewareExport,
	renderPipewarePreviewMesh,
	warmPipewareGeometry,
} from "./direct-geometry.js";

export const PIPEWARE_WORKER_PART = Object.freeze({
	id: PIPEWARE_PART_ID,
	renderer: Object.freeze({
		warm: warmPipewareGeometry,
		renderPreviewMesh: renderPipewarePreviewMesh,
		renderExport: renderPipewareExport,
	}),
});
