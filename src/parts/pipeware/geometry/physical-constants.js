import { DEFAULT_TILE_DIMENSIONS } from "../../shared/tile-dimensions.js";
import {
	PIPEWARE_OPENING_BASE_CUT_DEPTH,
	PIPEWARE_OPENING_WALL_OVERPUNCH,
	PIPEWARE_DEFAULT_BOARD_THICKNESS,
} from "../constants.js";
export {
	PIPEWARE_BOOLEAN_OVERLAP,
	getPipewareOpeningCutCenterInsetUnits,
	getPipewareOpeningCutHalfWidth,
	PIPEWARE_CHANNEL_WIDTH_SEPARATION,
	PIPEWARE_CORD_CUTOUT_CHAMFER,
	PIPEWARE_CORD_CUTOUT_WIDTH,
	PIPEWARE_GRIP_SIZE,
	PIPEWARE_GRIP_SPACING_FROM_CHANNEL,
	PIPEWARE_NUDGE,
	PIPEWARE_OPENING_BASE_CUT_DEPTH,
	PIPEWARE_OPENING_WALL_OVERPUNCH,
	PIPEWARE_TOP_CHAMFER,
} from "../constants.js";

export const PIPEWARE_DEFAULT_TILE_SIZE = DEFAULT_TILE_DIMENSIONS.tileSizeValue;
export const PIPEWARE_DEFAULT_CIRCLE_SEGMENTS =
	DEFAULT_TILE_DIMENSIONS.circleSegmentsValue;
export const PIPEWARE_DEFAULT_HEIGHT = PIPEWARE_DEFAULT_BOARD_THICKNESS;
export const PIPEWARE_MIN_ARC_SEGMENTS = 4;
export const PIPEWARE_EPSILON = 0.001;
export const PIPEWARE_BASE_HEIGHT = 3.4;
export const PIPEWARE_SNAP_WALL_THICKNESS = 2;
export const PIPEWARE_MIN_WALL = 0.4;
export const PIPEWARE_SNAP_CAPTURE_STRENGTH = 0.7;
export const PIPEWARE_GRIP_TOP_CHAMFER = 0.4;
export const PIPEWARE_OPENING_CUT_DEPTH =
	PIPEWARE_OPENING_BASE_CUT_DEPTH + PIPEWARE_OPENING_WALL_OVERPUNCH;
export const PIPEWARE_OPENING_COVER_CLEARANCE = 2.8;

export function clampPositive(value, fallback) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function clampPositiveInteger(value, fallback) {
	const number = Math.round(Number(value));
	return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function getArcSegmentCount(startAngle, endAngle, circleSegments) {
	return Math.max(
		PIPEWARE_MIN_ARC_SEGMENTS,
		Math.ceil(
			(clampPositiveInteger(circleSegments, PIPEWARE_DEFAULT_CIRCLE_SEGMENTS) *
				Math.abs(endAngle - startAngle)) /
				(Math.PI * 2),
		),
	);
}
