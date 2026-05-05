import { $, signal } from "refui";
import {
	PICA_TILE_PITCH,
	PICA_TILE_OFFSET,
	PICA_OPEN_GRID_LENGTH_MAX,
	PICA_OPEN_GRID_LENGTH_MIN,
	PICA_OPEN_GRID_TILE_SIZE_MAX,
	PICA_OPEN_GRID_TILE_SIZE_MIN,
} from "./constants.js";

function clamp(value, min, max) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return min;
	return Math.max(min, Math.min(max, numeric));
}

function clampNumberInput(raw, min, max, fallback) {
	const numeric = Number(raw);
	if (!Number.isFinite(numeric)) return fallback;
	return clamp(numeric, min, max);
}

function clampIntegerInput(raw, min, max, fallback) {
	return Math.round(clampNumberInput(raw, min, max, fallback));
}

export function createPicaRailController({ initialConfig, defaults }) {
	const openGridTileSizeValue = signal(
		initialConfig.openGridTileSizeValue ?? defaults.openGridTileSizeValue,
	);
	const openGridTileLength = signal(
		initialConfig.openGridTileLength ?? defaults.openGridTileLength,
	);

	const tilePitch = $(() => Number(PICA_TILE_PITCH));
	const targetLength = $(() => {
		const size = Number(openGridTileSizeValue.value);
		const length = Number(openGridTileLength.value);
		const safeSize = Number.isFinite(size) ? Math.max(PICA_OPEN_GRID_TILE_SIZE_MIN, size) : PICA_OPEN_GRID_TILE_SIZE_MIN;
		const safeLength = Number.isFinite(length)
			? clampIntegerInput(
				length,
				PICA_OPEN_GRID_LENGTH_MIN,
				PICA_OPEN_GRID_LENGTH_MAX,
				PICA_OPEN_GRID_LENGTH_MIN,
			)
			: PICA_OPEN_GRID_LENGTH_MIN;
		return safeSize * safeLength;
	});

	const tileCount = $(() =>
		Math.max(0, Math.floor(targetLength.value / tilePitch.value)),
	);
	const endExtension = $(() =>
		(targetLength.value - tileCount.value * tilePitch.value) / 2,
	);
	const maxReachableLength = $(
		() => tileCount.value * tilePitch.value + endExtension.value * 2,
	);
	const tileOffset = $(() => Number(PICA_TILE_OFFSET));

	const getConfigState = () => ({
		openGridTileSizeValue: openGridTileSizeValue.value,
		openGridTileLength: openGridTileLength.value,
	});

	const buildExportConfig = () => ({
		openGridTileSizeValue: Number(openGridTileSizeValue.value),
		openGridTileLength: Number(openGridTileLength.value),
	});

	const applyConfig = (config, nextDefaults = defaults) => {
		openGridTileSizeValue.value = clampNumberInput(
			config.openGridTileSizeValue ??
				nextDefaults.openGridTileSizeValue ??
				PICA_OPEN_GRID_TILE_SIZE_MIN,
			PICA_OPEN_GRID_TILE_SIZE_MIN,
			PICA_OPEN_GRID_TILE_SIZE_MAX,
			PICA_OPEN_GRID_TILE_SIZE_MIN,
		);
		openGridTileLength.value = clampIntegerInput(
			config.openGridTileLength ??
				nextDefaults.openGridTileLength ??
				PICA_OPEN_GRID_LENGTH_MIN,
			PICA_OPEN_GRID_LENGTH_MIN,
			PICA_OPEN_GRID_LENGTH_MAX,
			PICA_OPEN_GRID_LENGTH_MIN,
		);
	};

	const readEditorAction = () => null;
	const performEditorAction = () => {};

	return Object.freeze({
		signals: Object.freeze({
			openGridTileSizeValue,
			openGridTileLength,
			targetLength,
			picaTileCount: tileCount,
			endExtension,
			picaTilePitch: tilePitch,
			picaRailLength: maxReachableLength,
			picaTileOffset: tileOffset,
		}),
		actions: Object.freeze({
			clampIntegerInput,
			clampNumberInput,
		}),
		editorActions: Object.freeze({
			readAction: readEditorAction,
			performAction: performEditorAction,
		}),
		getConfigState,
		buildExportConfig,
		applyConfig,
	});
}
