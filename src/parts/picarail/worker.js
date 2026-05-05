import { PICARAIL_PART_ID } from "./constants.js";
import {
	renderPicaRailExport,
	renderPicaRailPreviewMesh,
	warmPicaRailGeometry,
} from "./direct-geometry.js";

export const PICARAIL_WORKER_PART = Object.freeze({
	id: PICARAIL_PART_ID,
	renderer: Object.freeze({
		warm: warmPicaRailGeometry,
		renderPreviewMesh: renderPicaRailPreviewMesh,
		renderExport: renderPicaRailExport,
	}),
});
