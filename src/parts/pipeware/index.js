import { PIPEWARE_METADATA } from "./metadata.js";
import { createPipewareEditor2D } from "./editor2d.js";
import { createPipewareDefaultConfig } from "./default-config.js";
import {
	renderPipewareExport,
	renderPipewarePreviewMesh,
	warmPipewareGeometry,
} from "./direct-geometry.js";

export const PIPEWARE_PART = Object.freeze({
	id: PIPEWARE_METADATA.id,
	metadata: PIPEWARE_METADATA,
	capabilities: Object.freeze({
		preview: true,
		exportFormats: ["stl-binary", "stl-ascii", "3mf"],
		textExport: null,
	}),
	createDefaultConfig: createPipewareDefaultConfig,
	editors: Object.freeze({
		preview2D: Object.freeze({
			create: createPipewareEditor2D,
		}),
	}),
	renderer: Object.freeze({
		warm: warmPipewareGeometry,
		renderPreviewMesh: renderPipewarePreviewMesh,
		renderExport: renderPipewareExport,
	}),
});
