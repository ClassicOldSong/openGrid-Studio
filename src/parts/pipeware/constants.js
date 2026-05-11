import { DEFAULT_TILE_DIMENSIONS } from "../shared/tile-dimensions.js";

export const PIPEWARE_FEATURE_OPTIONS = [
	{ value: "I", label: "Straight" },
	{ value: "B", label: "Bridge" },
	{ value: "L", label: "Corner" },
	{ value: "T", label: "T Junction" },
	{ value: "X", label: "Cross" },
	{ value: "S", label: "S Bend" },
	{ value: "D", label: "Diagonal" },
];

export const PIPEWARE_DEFAULT_BOARD_THICKNESS = 14.6;
export const PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD = 0;
export const PIPEWARE_THICKNESS_MIN = 0.1;
export const PIPEWARE_THICKNESS_MAX = 80;

export const PIPEWARE_PARAM_LIMITS = {
	I: {
		lengthUnits: { min: 1, max: 24 },
		widthUnits: { min: 1, max: 8 },
		zHeightValue: {
			min: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
			max: PIPEWARE_THICKNESS_MAX,
		},
	},
	B: {
		lengthUnits: { min: 1, max: 24 },
		widthUnits: { min: 1, max: 8 },
		bridgeClearanceValue: { min: 0, max: PIPEWARE_THICKNESS_MAX },
		openingHeightValue: {
			min: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
			max: PIPEWARE_THICKNESS_MAX,
		},
		zHeightValue: {
			min: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
			max: PIPEWARE_THICKNESS_MAX,
		},
	},
	L: {
		lengthUnitsX: { min: 0, max: 24 },
		lengthUnitsY: { min: 0, max: 24 },
		addedRadiusUnits: { min: 0, max: 12 },
		widthUnits: { min: 1, max: 8 },
		zHeightValue: {
			min: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
			max: PIPEWARE_THICKNESS_MAX,
		},
	},
	T: {
		lengthUnitsLeft: { min: 0, max: 24 },
		lengthUnitsRight: { min: 0, max: 24 },
		lengthUnitsY: { min: 1, max: 24 },
		widthUnitsX: { min: 1, max: 8 },
		widthUnitsY: { min: 1, max: 8 },
		zHeightValue: {
			min: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
			max: PIPEWARE_THICKNESS_MAX,
		},
	},
	X: {
		lengthUnitsLeft: { min: 1, max: 24 },
		lengthUnitsRight: { min: 1, max: 24 },
		lengthUnitsTop: { min: 1, max: 24 },
		lengthUnitsBottom: { min: 1, max: 24 },
		widthUnitsX: { min: 1, max: 8 },
		widthUnitsY: { min: 1, max: 8 },
		zHeightValue: {
			min: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
			max: PIPEWARE_THICKNESS_MAX,
		},
	},
	S: {
		lengthUnitsBottom: { min: 1, max: 24 },
		lengthUnitsTop: { min: 1, max: 24 },
		offsetUnits: { min: -12, max: 12 },
		riseUnits: { min: 1, max: 24 },
		channelWidthUnits: { min: 1, max: 8 },
		zHeightValue: {
			min: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
			max: PIPEWARE_THICKNESS_MAX,
		},
	},
	D: {
		lengthUnitsBottom: { min: 1, max: 24 },
		lengthUnitsTop: { min: 1, max: 24 },
		offsetUnits: { min: -12, max: 12 },
		riseUnits: { min: 1, max: 24 },
		channelWidthUnits: { min: 1, max: 8 },
		zHeightValue: {
			min: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
			max: PIPEWARE_THICKNESS_MAX,
		},
	},
};

export const PIPEWARE_DEFAULT_FEATURE_PARAMS = {
	I: {
		lengthUnits: 2,
		widthUnits: 1,
		zHeightValue: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
	},
	B: {
		lengthUnits: 3,
		widthUnits: 1,
		bridgeClearanceValue: PIPEWARE_DEFAULT_BOARD_THICKNESS + 7.4,
		openingHeightValue: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
		zHeightValue: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
	},
	L: {
		lengthUnitsX: 0,
		lengthUnitsY: 0,
		addedRadiusUnits: 0,
		widthUnits: 1,
		zHeightValue: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
	},
	T: {
		lengthUnitsLeft: 1,
		lengthUnitsRight: 1,
		lengthUnitsY: 1,
		widthUnitsX: 1,
		widthUnitsY: 1,
		zHeightValue: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
	},
	X: {
		lengthUnitsLeft: 1,
		lengthUnitsRight: 1,
		lengthUnitsTop: 1,
		lengthUnitsBottom: 1,
		widthUnitsX: 1,
		widthUnitsY: 1,
		zHeightValue: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
	},
	S: {
		lengthUnitsBottom: 1,
		lengthUnitsTop: 1,
		offsetUnits: 2,
		riseUnits: 2,
		channelWidthUnits: 1,
		zHeightValue: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
	},
	D: {
		lengthUnitsBottom: 1,
		lengthUnitsTop: 1,
		offsetUnits: 2,
		riseUnits: 2,
		channelWidthUnits: 1,
		zHeightValue: PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
	},
};

export const PIPEWARE_PARAM_FIELDS = {
	I: [
		{ key: "lengthUnits", label: "Straight Length" },
		{ key: "widthUnits", label: "Width" },
		{
			key: "zHeightValue",
			label: "Part Inner Height",
			step: 0.1,
		},
	],
	B: [
		{ key: "lengthUnits", label: "Bridge Length" },
		{ key: "widthUnits", label: "Width" },
		{
			key: "bridgeClearanceValue",
			label: "Bridge Clearance",
			step: 0.1,
		},
		{
			key: "openingHeightValue",
			label: "Opening Inner Height",
			step: 0.1,
		},
		{
			key: "zHeightValue",
			label: "Part Inner Height",
			step: 0.1,
		},
	],
	L: [
		{ key: "lengthUnitsX", label: "X Length" },
		{ key: "lengthUnitsY", label: "Y Length" },
		{ key: "addedRadiusUnits", label: "Added Radius" },
		{ key: "widthUnits", label: "Width" },
		{
			key: "zHeightValue",
			label: "Part Inner Height",
			step: 0.1,
		},
	],
	T: [
		{ key: "lengthUnitsLeft", label: "Left Length" },
		{ key: "lengthUnitsRight", label: "Right Length" },
		{ key: "lengthUnitsY", label: "Stem Length" },
		{ key: "widthUnitsX", label: "X Width" },
		{ key: "widthUnitsY", label: "Y Width" },
		{
			key: "zHeightValue",
			label: "Part Inner Height",
			step: 0.1,
		},
	],
	X: [
		{ key: "lengthUnitsLeft", label: "Left Length" },
		{ key: "lengthUnitsRight", label: "Right Length" },
		{ key: "lengthUnitsTop", label: "Top Length" },
		{ key: "lengthUnitsBottom", label: "Bottom Length" },
		{ key: "widthUnitsX", label: "X Width" },
		{ key: "widthUnitsY", label: "Y Width" },
		{
			key: "zHeightValue",
			label: "Part Inner Height",
			step: 0.1,
		},
	],
	S: [
		{ key: "lengthUnitsBottom", label: "Bottom Length" },
		{ key: "lengthUnitsTop", label: "Top Length" },
		{ key: "offsetUnits", label: "Offset" },
		{ key: "riseUnits", label: "Rise" },
		{ key: "channelWidthUnits", label: "Channel Width" },
		{
			key: "zHeightValue",
			label: "Part Inner Height",
			step: 0.1,
		},
	],
	D: [
		{ key: "lengthUnitsBottom", label: "Bottom Length" },
		{ key: "lengthUnitsTop", label: "Top Length" },
		{ key: "offsetUnits", label: "Offset" },
		{ key: "riseUnits", label: "Rise" },
		{ key: "channelWidthUnits", label: "Channel Width" },
		{
			key: "zHeightValue",
			label: "Part Inner Height",
			step: 0.1,
		},
	],
};

export const PIPEWARE_DEFAULT_ACTIVE_FEATURE_CONFIG = {
	type: "I",
	rotation: 0,
	params: PIPEWARE_DEFAULT_FEATURE_PARAMS.I,
};

export const PIPEWARE_DEFAULT_EDITOR_STATE = {
	pipewarePlacements: [],
	pipewareSelectedPlacementId: null,
	pipewareActiveFeatureConfig: PIPEWARE_DEFAULT_ACTIVE_FEATURE_CONFIG,
};

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
