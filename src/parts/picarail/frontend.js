import { createPicaRailEditor2D } from "./editor2d.js";
import { createPicaRailController } from "./controller.js";
import { PICARAIL_METADATA } from "./metadata.js";
import { buildPicaRailExportFilename } from "./export.js";
import PicaRailConfigSection from "./ConfigSection.jsx";
import { createPicaRailDefaultConfig } from "./default-config.js";

function createPicaRailConfigPanel(context) {
	const { partController: picaRail } = context;
	return {
		Component: PicaRailConfigSection,
		section: {
			constants: {
				MEASUREMENT_MIN: context.app.constants.MEASUREMENT_MIN,
				POSITIVE_MEASUREMENT_MIN:
					context.app.constants.POSITIVE_MEASUREMENT_MIN,
			},
			signals: picaRail.signals,
			actions: {
				clampIntegerInput: picaRail.actions.clampIntegerInput,
				clampNumberInput: picaRail.actions.clampNumberInput,
			},
		},
	};
}

export const PICARAIL_FRONTEND_PART = {
	id: PICARAIL_METADATA.id,
	metadata: PICARAIL_METADATA,
	accessories: PICARAIL_METADATA.accessories,
	capabilities: {
		preview: true,
		exportFormats: ["stl-binary", "stl-ascii", "3mf"],
		textExport: null,
	},
	createDefaultConfig: createPicaRailDefaultConfig,
	createController: createPicaRailController,
	buildExportFilename: buildPicaRailExportFilename,
	configPanel: {
		create: createPicaRailConfigPanel,
	},
	editors: {
		preview2D: {
			create: createPicaRailEditor2D,
		},
	},
};
