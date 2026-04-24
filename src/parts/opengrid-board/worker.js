import { OPEN_GRID_BOARD_PART_ID } from "./metadata.js";
import {
	renderOpenGridBoardExport,
	renderOpenGridBoardPreviewMesh,
	warmOpenGridBoardGeometry,
} from "./direct-geometry.js";

export const OPEN_GRID_BOARD_WORKER_PART = Object.freeze({
	id: OPEN_GRID_BOARD_PART_ID,
	renderer: Object.freeze({
		warm: warmOpenGridBoardGeometry,
		renderPreviewMesh: renderOpenGridBoardPreviewMesh,
		renderExport: renderOpenGridBoardExport,
	}),
});

