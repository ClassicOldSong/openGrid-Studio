import { DEFAULT_TILE_DIMENSIONS } from "../shared/tile-dimensions.js";

export const PIPEWARE_FEATURE_OPTIONS = Object.freeze([
	Object.freeze({ value: "I", label: "Straight" }),
	Object.freeze({ value: "B", label: "Bridge" }),
	Object.freeze({ value: "L", label: "Corner" }),
	Object.freeze({ value: "T", label: "T Junction" }),
	Object.freeze({ value: "X", label: "Cross" }),
	Object.freeze({ value: "S", label: "S Bend" }),
	Object.freeze({ value: "D", label: "Diagonal" }),
]);

export const PIPEWARE_DEFAULT_BOARD_THICKNESS = 14.6;
export const PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD = 0;
export const PIPEWARE_THICKNESS_MIN = 0.1;
export const PIPEWARE_THICKNESS_MAX = 80;

export const PIPEWARE_PARAM_LIMITS = Object.freeze({
	I: Object.freeze({
		lengthUnits: Object.freeze({ min: 1, max: 24 }),
		widthUnits: Object.freeze({ min: 1, max: 8 }),
		zHeightValue: Object.freeze({
			min: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
			max: PIPEWARE_THICKNESS_MAX,
		}),
	}),
	B: Object.freeze({
		lengthUnits: Object.freeze({ min: 1, max: 24 }),
		widthUnits: Object.freeze({ min: 1, max: 8 }),
		bridgeClearanceValue: Object.freeze({ min: 0, max: PIPEWARE_THICKNESS_MAX }),
		openingHeightValue: Object.freeze({
			min: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
			max: PIPEWARE_THICKNESS_MAX,
		}),
		zHeightValue: Object.freeze({
			min: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
			max: PIPEWARE_THICKNESS_MAX,
		}),
	}),
	L: Object.freeze({
		lengthUnitsX: Object.freeze({ min: 0, max: 24 }),
		lengthUnitsY: Object.freeze({ min: 0, max: 24 }),
		addedRadiusUnits: Object.freeze({ min: 0, max: 12 }),
		widthUnits: Object.freeze({ min: 1, max: 8 }),
		zHeightValue: Object.freeze({
			min: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
			max: PIPEWARE_THICKNESS_MAX,
		}),
	}),
	T: Object.freeze({
		lengthUnitsLeft: Object.freeze({ min: 0, max: 24 }),
		lengthUnitsRight: Object.freeze({ min: 0, max: 24 }),
		lengthUnitsY: Object.freeze({ min: 1, max: 24 }),
		widthUnitsX: Object.freeze({ min: 1, max: 8 }),
		widthUnitsY: Object.freeze({ min: 1, max: 8 }),
		zHeightValue: Object.freeze({
			min: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
			max: PIPEWARE_THICKNESS_MAX,
		}),
	}),
	X: Object.freeze({
		lengthUnitsLeft: Object.freeze({ min: 1, max: 24 }),
		lengthUnitsRight: Object.freeze({ min: 1, max: 24 }),
		lengthUnitsTop: Object.freeze({ min: 1, max: 24 }),
		lengthUnitsBottom: Object.freeze({ min: 1, max: 24 }),
		widthUnitsX: Object.freeze({ min: 1, max: 8 }),
		widthUnitsY: Object.freeze({ min: 1, max: 8 }),
		zHeightValue: Object.freeze({
			min: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
			max: PIPEWARE_THICKNESS_MAX,
		}),
	}),
	S: Object.freeze({
		lengthUnitsBottom: Object.freeze({ min: 1, max: 24 }),
		lengthUnitsTop: Object.freeze({ min: 1, max: 24 }),
		offsetUnits: Object.freeze({ min: -12, max: 12 }),
		riseUnits: Object.freeze({ min: 1, max: 24 }),
		channelWidthUnits: Object.freeze({ min: 1, max: 8 }),
		zHeightValue: Object.freeze({
			min: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
			max: PIPEWARE_THICKNESS_MAX,
		}),
	}),
	D: Object.freeze({
		lengthUnitsBottom: Object.freeze({ min: 1, max: 24 }),
		lengthUnitsTop: Object.freeze({ min: 1, max: 24 }),
		offsetUnits: Object.freeze({ min: -12, max: 12 }),
		riseUnits: Object.freeze({ min: 1, max: 24 }),
		channelWidthUnits: Object.freeze({ min: 1, max: 8 }),
		zHeightValue: Object.freeze({
			min: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
			max: PIPEWARE_THICKNESS_MAX,
		}),
	}),
});

export const PIPEWARE_DEFAULT_FEATURE_PARAMS = Object.freeze({
	I: Object.freeze({
		lengthUnits: 2,
		widthUnits: 1,
		zHeightValue: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
	}),
	B: Object.freeze({
		lengthUnits: 3,
		widthUnits: 1,
		bridgeClearanceValue: PIPEWARE_DEFAULT_BOARD_THICKNESS + 7.4,
		openingHeightValue: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
		zHeightValue: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
	}),
	L: Object.freeze({
		lengthUnitsX: 0,
		lengthUnitsY: 0,
		addedRadiusUnits: 0,
		widthUnits: 1,
		zHeightValue: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
	}),
	T: Object.freeze({
		lengthUnitsLeft: 1,
		lengthUnitsRight: 1,
		lengthUnitsY: 1,
		widthUnitsX: 1,
		widthUnitsY: 1,
		zHeightValue: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
	}),
	X: Object.freeze({
		lengthUnitsLeft: 1,
		lengthUnitsRight: 1,
		lengthUnitsTop: 1,
		lengthUnitsBottom: 1,
		widthUnitsX: 1,
		widthUnitsY: 1,
		zHeightValue: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
	}),
	S: Object.freeze({
		lengthUnitsBottom: 1,
		lengthUnitsTop: 1,
		offsetUnits: 2,
		riseUnits: 2,
		channelWidthUnits: 1,
		zHeightValue: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
	}),
	D: Object.freeze({
		lengthUnitsBottom: 1,
		lengthUnitsTop: 1,
		offsetUnits: 2,
		riseUnits: 2,
		channelWidthUnits: 1,
		zHeightValue: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
	}),
});

export const PIPEWARE_PARAM_FIELDS = Object.freeze({
	I: Object.freeze([
		Object.freeze({ key: "lengthUnits", label: "Straight Length" }),
		Object.freeze({ key: "widthUnits", label: "Width" }),
		Object.freeze({
			key: "zHeightValue",
			label: "Part Inner Height",
			step: 0.1,
		}),
	]),
	B: Object.freeze([
		Object.freeze({ key: "lengthUnits", label: "Bridge Length" }),
		Object.freeze({ key: "widthUnits", label: "Width" }),
		Object.freeze({
			key: "bridgeClearanceValue",
			label: "Bridge Clearance",
			step: 0.1,
		}),
		Object.freeze({
			key: "openingHeightValue",
			label: "Opening Inner Height",
			step: 0.1,
		}),
		Object.freeze({
			key: "zHeightValue",
			label: "Part Inner Height",
			step: 0.1,
		}),
	]),
	L: Object.freeze([
		Object.freeze({ key: "lengthUnitsX", label: "X Length" }),
		Object.freeze({ key: "lengthUnitsY", label: "Y Length" }),
		Object.freeze({ key: "addedRadiusUnits", label: "Added Radius" }),
		Object.freeze({ key: "widthUnits", label: "Width" }),
		Object.freeze({
			key: "zHeightValue",
			label: "Part Inner Height",
			step: 0.1,
		}),
	]),
	T: Object.freeze([
		Object.freeze({ key: "lengthUnitsLeft", label: "Left Length" }),
		Object.freeze({ key: "lengthUnitsRight", label: "Right Length" }),
		Object.freeze({ key: "lengthUnitsY", label: "Stem Length" }),
		Object.freeze({ key: "widthUnitsX", label: "X Width" }),
		Object.freeze({ key: "widthUnitsY", label: "Y Width" }),
		Object.freeze({
			key: "zHeightValue",
			label: "Part Inner Height",
			step: 0.1,
		}),
	]),
	X: Object.freeze([
		Object.freeze({ key: "lengthUnitsLeft", label: "Left Length" }),
		Object.freeze({ key: "lengthUnitsRight", label: "Right Length" }),
		Object.freeze({ key: "lengthUnitsTop", label: "Top Length" }),
		Object.freeze({ key: "lengthUnitsBottom", label: "Bottom Length" }),
		Object.freeze({ key: "widthUnitsX", label: "X Width" }),
		Object.freeze({ key: "widthUnitsY", label: "Y Width" }),
		Object.freeze({
			key: "zHeightValue",
			label: "Part Inner Height",
			step: 0.1,
		}),
	]),
	S: Object.freeze([
		Object.freeze({ key: "lengthUnitsBottom", label: "Bottom Length" }),
		Object.freeze({ key: "lengthUnitsTop", label: "Top Length" }),
		Object.freeze({ key: "offsetUnits", label: "Offset" }),
		Object.freeze({ key: "riseUnits", label: "Rise" }),
		Object.freeze({ key: "channelWidthUnits", label: "Channel Width" }),
		Object.freeze({
			key: "zHeightValue",
			label: "Part Inner Height",
			step: 0.1,
		}),
	]),
	D: Object.freeze([
		Object.freeze({ key: "lengthUnitsBottom", label: "Bottom Length" }),
		Object.freeze({ key: "lengthUnitsTop", label: "Top Length" }),
		Object.freeze({ key: "offsetUnits", label: "Offset" }),
		Object.freeze({ key: "riseUnits", label: "Rise" }),
		Object.freeze({ key: "channelWidthUnits", label: "Channel Width" }),
		Object.freeze({
			key: "zHeightValue",
			label: "Part Inner Height",
			step: 0.1,
		}),
	]),
});

export const PIPEWARE_DEFAULT_ACTIVE_FEATURE_CONFIG = Object.freeze({
	type: "I",
	rotation: 0,
	params: PIPEWARE_DEFAULT_FEATURE_PARAMS.I,
});

export const PIPEWARE_DEFAULT_EDITOR_STATE = Object.freeze({
	pipewarePlacements: Object.freeze([]),
	pipewareSelectedPlacementId: null,
	pipewareActiveFeatureConfig: PIPEWARE_DEFAULT_ACTIVE_FEATURE_CONFIG,
});

export const PIPEWARE_OPENING_LINE_LENGTH_UNITS = 0.3;
export const PIPEWARE_OPENING_EDGE_INSET_UNITS = 0.22;
export const PIPEWARE_OPENING_MASK_STROKE_UNITS = 0.42;
export const PIPEWARE_PORT_OPENING_INSET_UNITS = 0.03;

export const PIPEWARE_CHANNEL_WIDTH_SEPARATION = 0.8;
export const PIPEWARE_TOP_CHAMFER = 4;
export const PIPEWARE_NUDGE = 0.01;
export const PIPEWARE_GRIP_SIZE = 15;
export const PIPEWARE_GRIP_SPACING_FROM_CHANNEL = 6.5;
export const PIPEWARE_OPENING_BASE_CUT_DEPTH =
	PIPEWARE_TOP_CHAMFER * 2 + PIPEWARE_NUDGE;
export const PIPEWARE_OPENING_WALL_OVERPUNCH = 2.4;
export const PIPEWARE_CORD_CUTOUT_WIDTH = 12;
export const PIPEWARE_CORD_CUTOUT_CHAMFER = 2;
export const PIPEWARE_BOOLEAN_OVERLAP = 0.4;

export function getPipewareOpeningCutCenterInsetUnits(tileSize) {
	const baseCutDepth = getPipewareOpeningBaseCutDepth(tileSize);
	const wallOverpunch = getPipewareOpeningWallOverpunch(tileSize);
	return (
		(PIPEWARE_CHANNEL_WIDTH_SEPARATION +
			baseCutDepth / 2 -
			wallOverpunch / 2) /
		tileSize
	);
}

function getPipewareTileScale(tileSize) {
	const number = Number(tileSize);
	const fallback = DEFAULT_TILE_DIMENSIONS.tileSizeValue;
	return (Number.isFinite(number) && number > 0 ? number : fallback) / fallback;
}

export function getPipewareGripSize(tileSize) {
	return PIPEWARE_GRIP_SIZE * getPipewareTileScale(tileSize);
}

export function getPipewareGripSpacingFromChannel(tileSize) {
	return PIPEWARE_GRIP_SPACING_FROM_CHANNEL * getPipewareTileScale(tileSize);
}

export function getPipewareOpeningBaseCutDepth(tileSize) {
	return PIPEWARE_OPENING_BASE_CUT_DEPTH * getPipewareTileScale(tileSize);
}

export function getPipewareOpeningWallOverpunch(tileSize) {
	return PIPEWARE_OPENING_WALL_OVERPUNCH * getPipewareTileScale(tileSize);
}

export function getPipewareCordCutoutWidth(tileSize) {
	return PIPEWARE_CORD_CUTOUT_WIDTH * getPipewareTileScale(tileSize);
}

export function getPipewareCordCutoutChamfer(tileSize) {
	return PIPEWARE_CORD_CUTOUT_CHAMFER * getPipewareTileScale(tileSize);
}

export function getPipewareOpeningCutDepth(tileSize) {
	return (
		getPipewareOpeningBaseCutDepth(tileSize) +
		getPipewareOpeningWallOverpunch(tileSize)
	);
}

export function getPipewareOpeningCutHalfWidth(tileSize) {
	const desiredHalfWidth = getPipewareCordCutoutWidth(tileSize) / 2;
	const gripSize = getPipewareGripSize(tileSize);
	const gripSpacing = getPipewareGripSpacingFromChannel(tileSize);
	const hookGapHalfWidth = Math.max(
		0,
		Math.min(
			gripSpacing,
			tileSize - gripSize - gripSpacing,
		) - PIPEWARE_BOOLEAN_OVERLAP,
	);
	return Math.max(0.001, Math.min(desiredHalfWidth, hookGapHalfWidth));
}

export function getPipewareOpeningCutHalfWidthUnits(tileSize) {
	return getPipewareOpeningCutHalfWidth(tileSize) / tileSize;
}
