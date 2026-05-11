import { createPipewareEditor2D } from "./editor2d.js";
import { PIPEWARE_METADATA } from "./metadata.js";
import PipewareConfigSection from "./ConfigSection.jsx";
import { createPipewareController } from "./controller.js";
import { createPipewareDefaultConfig } from "./default-config.js";
import { buildPipewareExportFilename } from "./export.js";

function createPipewareConfigPanel(context) {
	const { app, partController: pipeware } = context;
	return {
		Component: PipewareConfigSection,
		section: {
			constants: {
				BOARD_DIMENSION_MIN: app.constants.BOARD_DIMENSION_MIN,
				TILE_SIZE_MIN: app.constants.TILE_SIZE_MIN,
				THICKNESS_MIN: app.constants.POSITIVE_MEASUREMENT_MIN,
				SEGMENTS_MIN: app.constants.SEGMENTS_MIN,
			},
			signals: {
				width: pipeware.signals.width,
				height: pipeware.signals.height,
				tileSizeValue: pipeware.signals.tileSizeValue,
				pipewareBoardThicknessValue:
					pipeware.signals.pipewareBoardThicknessValue,
				circleSegmentsValue: pipeware.signals.circleSegmentsValue,
				pipewareActiveFeatureConfig:
					pipeware.signals.pipewareActiveFeatureConfig,
				pipewareSelectedPlacement: pipeware.signals.pipewareSelectedPlacement,
				pipewareSelectedPlacementLabel:
					pipeware.signals.pipewareSelectedPlacementLabel,
			},
			actions: {
				updateSize: pipeware.updateSize,
				clampIntegerInput: app.actions.clampIntegerInput,
				clampNumberInput: app.actions.clampNumberInput,
				...pipeware.configPanelActions,
			},
		},
	};
}

export const PIPEWARE_FRONTEND_PART = {
	id: PIPEWARE_METADATA.id,
	metadata: PIPEWARE_METADATA,
	accessories: PIPEWARE_METADATA.accessories,
	capabilities: {
		preview: true,
		exportFormats: ["stl-binary", "stl-ascii", "3mf"],
		textExport: null,
	},
	createDefaultConfig: createPipewareDefaultConfig,
	createController: createPipewareController,
	buildExportFilename: buildPipewareExportFilename,
	configPanel: {
		create: createPipewareConfigPanel,
	},
	editors: {
		preview2D: {
			create: createPipewareEditor2D,
		},
	},
};
