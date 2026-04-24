import { createOpenGridBoardEditor2D } from "./editor2d.js";
import {
	buildOpenGridBoardEntryScad,
	buildOpenGridBoardExportFilename,
} from "./export.js";
import { OPEN_GRID_BOARD_METADATA } from "./metadata.js";
import OpenGridBoardConfigSection from "./ConfigSection.jsx";
import { createOpenGridBoardController } from "./controller.js";
import { createOpenGridBoardDefaultConfig } from "./default-config.js";

function createOpenGridBoardConfigPanel(context) {
	const { app, partController: openGrid } = context;
	return Object.freeze({
		Component: OpenGridBoardConfigSection,
		section: Object.freeze({
			constants: Object.freeze({
				BOARD_DIMENSION_MIN: app.constants.BOARD_DIMENSION_MIN,
				TOP_COLUMN_MIN: app.constants.TOP_COLUMN_MIN,
				STACK_COUNT_MIN: app.constants.STACK_COUNT_MIN,
				TILE_SIZE_MIN: app.constants.TILE_SIZE_MIN,
				MEASUREMENT_MIN: app.constants.MEASUREMENT_MIN,
				POSITIVE_MEASUREMENT_MIN: app.constants.POSITIVE_MEASUREMENT_MIN,
				SEGMENTS_MIN: app.constants.SEGMENTS_MIN,
				COUNTERSINK_DEGREE_MIN: app.constants.COUNTERSINK_DEGREE_MIN,
			}),
			signals: Object.freeze({
				...openGrid.signals,
			}),
			actions: Object.freeze({
				...openGrid.configPanelActions,
			}),
		}),
	});
}

export const OPEN_GRID_BOARD_FRONTEND_PART = Object.freeze({
	id: OPEN_GRID_BOARD_METADATA.id,
	metadata: OPEN_GRID_BOARD_METADATA,
	capabilities: Object.freeze({
		preview: true,
		exportFormats: ["stl-binary", "stl-ascii", "3mf"],
		textExport: "scad",
	}),
	createDefaultConfig: createOpenGridBoardDefaultConfig,
	createController: createOpenGridBoardController,
	buildExportText: buildOpenGridBoardEntryScad,
	buildExportFilename: buildOpenGridBoardExportFilename,
	configPanel: Object.freeze({
		create: createOpenGridBoardConfigPanel,
	}),
	editors: Object.freeze({
		preview2D: Object.freeze({
			create: createOpenGridBoardEditor2D,
		}),
	}),
});
