import { PICARAIL_PART_ID } from "./constants.js";
import {
	renderPicaRailExport,
	renderPicaRailPreviewMesh,
	warmPicaRailGeometry,
} from "./direct-geometry.js";

export const PICARAIL_WORKER_PART = {
	id: PICARAIL_PART_ID,
	renderer: {
		warm: warmPicaRailGeometry,
		renderPreviewMesh: renderPicaRailPreviewMesh,
		renderExport: renderPicaRailExport,
	},
};
