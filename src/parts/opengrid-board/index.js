import { createOpenGridBoardEditor2D } from "./editor2d.js";
import { createOpenGridBoardDefaultConfig } from "./default-config.js";
import {
	buildOpenGridBoardEntryScad,
	buildOpenGridBoardExportFilename,
} from "./export.js";
import { OPEN_GRID_BOARD_METADATA } from "./metadata.js";
import {
	renderOpenGridBoardExport,
	renderOpenGridBoardPreviewMesh,
	warmOpenGridBoardGeometry,
} from "./direct-geometry.js";

export const OPEN_GRID_BOARD_PART = Object.freeze({
	id: OPEN_GRID_BOARD_METADATA.id,
	metadata: OPEN_GRID_BOARD_METADATA,
	capabilities: Object.freeze({
		preview: true,
		exportFormats: ["stl-binary", "stl-ascii", "3mf"],
		textExport: "scad",
	}),
	createDefaultConfig: createOpenGridBoardDefaultConfig,
	buildExportText: buildOpenGridBoardEntryScad,
	buildExportFilename: buildOpenGridBoardExportFilename,
	editors: Object.freeze({
		preview2D: Object.freeze({
			create: createOpenGridBoardEditor2D,
		}),
	}),
	renderer: Object.freeze({
		warm: warmOpenGridBoardGeometry,
		renderPreviewMesh: renderOpenGridBoardPreviewMesh,
		renderExport: renderOpenGridBoardExport,
	}),
});
