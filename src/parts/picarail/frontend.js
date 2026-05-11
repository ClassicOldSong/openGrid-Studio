import { createPicaRailEditor2D } from "./editor2d.js";
import { createPicaRailController } from "./controller.js";
import { PICARAIL_METADATA } from "./metadata.js";
import { buildPicaRailExportFilename } from "./export.js";
import PicaRailConfigSection from "./ConfigSection.jsx";
import { createPicaRailDefaultConfig } from "./default-config.js";

function createPicaRailConfigPanel(context) {
	const { partController: picaRail } = context;
	return Object.freeze({
		Component: PicaRailConfigSection,
		section: Object.freeze({
			constants: Object.freeze({
				MEASUREMENT_MIN: context.app.constants.MEASUREMENT_MIN,
				POSITIVE_MEASUREMENT_MIN:
					context.app.constants.POSITIVE_MEASUREMENT_MIN,
			}),
			signals: Object.freeze(picaRail.signals),
			actions: Object.freeze({
				clampIntegerInput: picaRail.actions.clampIntegerInput,
				clampNumberInput: picaRail.actions.clampNumberInput,
			}),
		}),
	});
}

export const PICARAIL_FRONTEND_PART = Object.freeze({
	id: PICARAIL_METADATA.id,
	metadata: PICARAIL_METADATA,
	accessories: PICARAIL_METADATA.accessories,
	capabilities: Object.freeze({
		preview: true,
		exportFormats: ["stl-binary", "stl-ascii", "3mf"],
		textExport: null,
	}),
	createDefaultConfig: createPicaRailDefaultConfig,
	createController: createPicaRailController,
	buildExportFilename: buildPicaRailExportFilename,
	configPanel: Object.freeze({
		create: createPicaRailConfigPanel,
	}),
	editors: Object.freeze({
		preview2D: Object.freeze({
			create: createPicaRailEditor2D,
		}),
	}),
});
