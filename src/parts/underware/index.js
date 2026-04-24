import { UNDERWARE_METADATA } from "./metadata.js";

async function throwUnimplemented() {
	throw new Error("Underware generation is not implemented yet.");
}

export const UNDERWARE_PART = Object.freeze({
	id: UNDERWARE_METADATA.id,
	metadata: UNDERWARE_METADATA,
	capabilities: Object.freeze({
		preview: false,
		exportFormats: [],
		textExport: null,
	}),
	createDefaultConfig: UNDERWARE_METADATA.createDefaultConfig,
	editors: Object.freeze({}),
	renderer: Object.freeze({
		warm: async () => {},
		renderPreviewMesh: throwUnimplemented,
		renderExport: throwUnimplemented,
	}),
});
