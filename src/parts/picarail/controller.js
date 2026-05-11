import { $, signal } from "refui";
import {
	PICA_TILE_PITCH,
	PICA_OPEN_GRID_LENGTH_MAX,
	PICA_OPEN_GRID_LENGTH_MIN,
	PICA_OPEN_GRID_TILE_SIZE_MAX,
	PICA_OPEN_GRID_TILE_SIZE_MIN,
	PICA_SCREW_HOLE_SEGMENTS_DEFAULT,
	PICA_SCREW_HOLE_SEGMENTS_MAX,
	PICA_SCREW_HOLE_SEGMENTS_MIN,
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

function sanitizeScrewHoleTiles(raw, tileLength) {
	const maxTile = Math.max(0, Math.round(Number(tileLength) || 0));
	if (!Array.isArray(raw) || maxTile <= 0) return [];
	return [
		...new Set(
			raw
				.map((value) => Math.round(Number(value)))
				.filter((value) =>
					Number.isFinite(value) && value >= 0 && value < maxTile,
				),
		),
	].sort((a, b) => a - b);
}

export function createPicaRailController({ initialConfig, defaults }) {
	const openGridTileSizeValue = signal(
		initialConfig.openGridTileSizeValue ?? defaults.openGridTileSizeValue,
	);
	const openGridTileLength = signal(
		initialConfig.openGridTileLength ?? defaults.openGridTileLength,
	);
	const extendEnds = signal(initialConfig.extendEnds ?? defaults.extendEnds ?? true);
	const screwHoleTiles = signal(
		sanitizeScrewHoleTiles(
			initialConfig.screwHoleTiles ?? defaults.screwHoleTiles,
			openGridTileLength.value,
		),
	);
	const screwHoleSegmentsValue = signal(
		clampIntegerInput(
			initialConfig.screwHoleSegmentsValue ??
				defaults.screwHoleSegmentsValue ??
				PICA_SCREW_HOLE_SEGMENTS_DEFAULT,
			PICA_SCREW_HOLE_SEGMENTS_MIN,
			PICA_SCREW_HOLE_SEGMENTS_MAX,
			PICA_SCREW_HOLE_SEGMENTS_DEFAULT,
		),
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
		extendEnds.value
			? (targetLength.value - tileCount.value * tilePitch.value) / 2
			: 0,
	);
	const maxReachableLength = $(
		() => tileCount.value * tilePitch.value + endExtension.value * 2,
	);
	const normalizedScrewHoleTiles = $(() =>
		sanitizeScrewHoleTiles(screwHoleTiles.value, openGridTileLength.value),
	);

	const getConfigState = () => ({
		openGridTileSizeValue: openGridTileSizeValue.value,
		openGridTileLength: openGridTileLength.value,
		extendEnds: extendEnds.value,
		screwHoleTiles: normalizedScrewHoleTiles.value,
		screwHoleSegmentsValue: screwHoleSegmentsValue.value,
	});

	const buildExportConfig = () => ({
		openGridTileSizeValue: Number(openGridTileSizeValue.value),
		openGridTileLength: Number(openGridTileLength.value),
		extendEnds: !!extendEnds.value,
		screwHoleTiles: normalizedScrewHoleTiles.value,
		screwHoleSegmentsValue: Number(screwHoleSegmentsValue.value),
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
		extendEnds.value = config.extendEnds ?? nextDefaults.extendEnds ?? true;
		screwHoleTiles.value = sanitizeScrewHoleTiles(
			config.screwHoleTiles ?? nextDefaults.screwHoleTiles,
			openGridTileLength.value,
		);
		screwHoleSegmentsValue.value = clampIntegerInput(
			config.screwHoleSegmentsValue ??
				nextDefaults.screwHoleSegmentsValue ??
				PICA_SCREW_HOLE_SEGMENTS_DEFAULT,
			PICA_SCREW_HOLE_SEGMENTS_MIN,
			PICA_SCREW_HOLE_SEGMENTS_MAX,
			PICA_SCREW_HOLE_SEGMENTS_DEFAULT,
		);
	};

	const resizeTileLength = (nextLength, leftOffset = 0) => {
		const length = clampIntegerInput(
			nextLength,
			PICA_OPEN_GRID_LENGTH_MIN,
			PICA_OPEN_GRID_LENGTH_MAX,
			openGridTileLength.value,
		);
		if (length === openGridTileLength.value && leftOffset === 0) return;
		openGridTileLength.value = length;
		if (leftOffset !== 0) {
			screwHoleTiles.value = sanitizeScrewHoleTiles(
				normalizedScrewHoleTiles.value.map((tileIndex) => tileIndex + leftOffset),
				length,
			);
			return;
		}
		screwHoleTiles.value = sanitizeScrewHoleTiles(
			normalizedScrewHoleTiles.value,
			length,
		);
	};

	const readEditorAction = (target) => {
		const actionEl = target?.closest?.("[data-editor-action]");
		if (!actionEl) return null;
		const type = actionEl.getAttribute("data-editor-action");
		if (!type) return null;
		if (type === "screw-hole-tile") {
			return {
				type,
				tileIndex: Number(actionEl.getAttribute("data-tile-index")),
			};
		}
		return { type };
	};

	const performEditorAction = (action) => {
		if (!action?.type) return;
		switch (action.type) {
			case "left-add":
				resizeTileLength(openGridTileLength.value + 1, 1);
				return;
			case "left-remove":
				resizeTileLength(openGridTileLength.value - 1, -1);
				return;
			case "right-add":
				resizeTileLength(openGridTileLength.value + 1);
				return;
			case "right-remove":
				resizeTileLength(openGridTileLength.value - 1);
				return;
			case "screw-hole-tile":
				break;
			default:
				return;
		}
		const tileIndex = Math.round(Number(action.tileIndex));
		if (
			!Number.isFinite(tileIndex) ||
			tileIndex < 0 ||
			tileIndex >= openGridTileLength.value
		) {
			return;
		}
		const current = new Set(normalizedScrewHoleTiles.value);
		if (current.has(tileIndex)) {
			current.delete(tileIndex);
		} else {
			current.add(tileIndex);
		}
		screwHoleTiles.value = [...current].sort((a, b) => a - b);
	};

	return {
		signals: {
			openGridTileSizeValue,
			openGridTileLength,
			extendEnds,
			picaTileCount: tileCount,
			picaRailLength: maxReachableLength,
			screwHoleTiles: normalizedScrewHoleTiles,
			screwHoleSegmentsValue,
		},
		actions: {
			clampIntegerInput,
			clampNumberInput,
		},
		editorActions: {
			readAction: readEditorAction,
			performAction: performEditorAction,
		},
		getConfigState,
		buildExportConfig,
		applyConfig,
	};
}
