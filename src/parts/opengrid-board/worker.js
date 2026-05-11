import { OPEN_GRID_BOARD_PART_ID } from "./metadata.js";
import {
	renderOpenGridBoardExport,
	renderOpenGridBoardPreviewMesh,
	warmOpenGridBoardGeometry,
} from "./direct-geometry.js";

export const OPEN_GRID_BOARD_WORKER_PART = {
	id: OPEN_GRID_BOARD_PART_ID,
	renderer: {
		warm: warmOpenGridBoardGeometry,
		renderPreviewMesh: renderOpenGridBoardPreviewMesh,
		renderExport: renderOpenGridBoardExport,
	},
};

