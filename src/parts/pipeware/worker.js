import { PIPEWARE_PART_ID } from "./metadata.js";
import {
	renderPipewareExport,
	renderPipewarePreviewMesh,
	warmPipewareGeometry,
} from "./direct-geometry.js";

export const PIPEWARE_WORKER_PART = {
	id: PIPEWARE_PART_ID,
	renderer: {
		warm: warmPipewareGeometry,
		renderPreviewMesh: renderPipewarePreviewMesh,
		renderExport: renderPipewareExport,
	},
};
