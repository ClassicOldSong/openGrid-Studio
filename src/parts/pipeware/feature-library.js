import {
	PIPEWARE_DEFAULT_FEATURE_PARAMS,
	PIPEWARE_FEATURE_OPTIONS,
	PIPEWARE_CORD_CUTOUT_WIDTH,
	getPipewareOpeningCutCenterInsetUnits,
	getPipewareOpeningCutHalfWidthUnits,
	PIPEWARE_GRIP_SIZE,
	PIPEWARE_GRIP_SPACING_FROM_CHANNEL,
	PIPEWARE_OPENING_BASE_CUT_DEPTH,
	PIPEWARE_OPENING_EDGE_INSET_UNITS,
	PIPEWARE_OPENING_LINE_LENGTH_UNITS,
	PIPEWARE_OPENING_WALL_OVERPUNCH,
	PIPEWARE_PARAM_LIMITS,
	PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
	PIPEWARE_THICKNESS_MIN,
} from "./constants.js";
import {
	findNearestPipewareBaseSideSample,
	getBasePipewareLGeometry,
	getOffsetBendLayout,
	getPipewareBaseSideSamples,
	getPipewareFeatureBaseGeometry,
	pipewareFeatureBodySticksOut,
	pointAtPipewareSegment,
	pointInsidePipewareBaseGeometryBand,
	tangentAtPipewareSegment,
} from "./feature-paths.js";

export { getBasePipewareLGeometry } from "./feature-paths.js";

const PIPEWARE_ROTATION_STEP = 90;

const PIPEWARE_SIDE_ROTATE_CCW = Object.freeze({
	N: "W",
	W: "S",
	S: "E",
	E: "N",
	L: "L",
	R: "R",
	HT: "HT",
	HB: "HB",
	VL: "VL",
	VR: "VR",
	CNW: "CNW",
	CNE: "CNE",
	CSW: "CSW",
	CSE: "CSE",
});
const PIPEWARE_FOOTPRINT_SAMPLE_RESOLUTION = 8;
const PIPEWARE_VALID_FEATURE_TYPES = new Set(
	PIPEWARE_FEATURE_OPTIONS.map((option) => option.value),
);
const PIPEWARE_VALID_EDGE_SIDES = new Set([
	"N",
	"E",
	"S",
	"W",
	"L",
	"R",
	"HT",
	"HB",
	"VL",
	"VR",
	"CNW",
	"CNE",
	"CSW",
	"CSE",
]);
const PIPEWARE_EDGE_COORD_PRECISION = 4;

export function clampPipewareInteger(raw, min, max, fallback = min) {
	const value = Number(raw);
	if (!Number.isFinite(value)) return fallback;
	return Math.max(min, Math.min(max, Math.round(value)));
}

function clampPipewareNumber(raw, min, max, fallback = min) {
	const value = Number(raw);
	if (!Number.isFinite(value)) return fallback;
	return Math.max(min, Math.min(max, value));
}

function normalizePipewareZHeight(
	raw,
	max,
	fallback = PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD,
) {
	const value = Number(raw);
	if (!Number.isFinite(value)) return fallback;
	if (value <= 0) return PIPEWARE_PART_Z_HEIGHT_FOLLOW_BOARD;
	return clampPipewareNumber(value, PIPEWARE_THICKNESS_MIN, max, fallback);
}

export function normalizePipewareRotation(rotation = 0) {
	const normalized =
		(Math.round(Number(rotation) / PIPEWARE_ROTATION_STEP) *
			PIPEWARE_ROTATION_STEP) %
		360;
	return normalized < 0 ? normalized + 360 : normalized;
}

export function normalizePipewareFeatureType(type) {
	return PIPEWARE_VALID_FEATURE_TYPES.has(type) ? type : "I";
}

function formatPipewareEdgeCoord(value) {
	const rounded = Number(Number(value).toFixed(PIPEWARE_EDGE_COORD_PRECISION));
	return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function buildPipewareEdgeKey(tx, ty, side) {
	return `${formatPipewareEdgeCoord(tx)}:${formatPipewareEdgeCoord(ty)}:${side}`;
}

export function parsePipewareEdgeKey(edgeKey) {
	const [tx, ty, side] = String(edgeKey).split(":");
	if (!side) return null;
	return {
		tx: Number(tx),
		ty: Number(ty),
		side,
	};
}

export function getPipewareFeatureDefaultParams(type) {
	const normalizedType = normalizePipewareFeatureType(type);
	return { ...PIPEWARE_DEFAULT_FEATURE_PARAMS[normalizedType] };
}

export function normalizePipewareFeatureParams(type, params = {}) {
	const normalizedType = normalizePipewareFeatureType(type);
	const fallback = getPipewareFeatureDefaultParams(normalizedType);
	const limits = PIPEWARE_PARAM_LIMITS[normalizedType] ?? PIPEWARE_PARAM_LIMITS.I;
	const sourceParams =
		normalizedType === "D"
			? {
					...params,
					offsetUnits: params.offsetUnits ?? params.lengthUnitsX,
					riseUnits: params.riseUnits ?? params.lengthUnitsY,
				}
			: params;
	const normalized = {};
	for (const [key, limit] of Object.entries(limits)) {
		let sourceValue = sourceParams[key];
		if (
			sourceValue == null &&
			(key === "widthUnitsX" ||
				key === "widthUnitsY" ||
				key === "channelWidthUnits")
		) {
			sourceValue = sourceParams.widthUnits;
		}
		normalized[key] =
			key === "zHeightValue"
				? normalizePipewareZHeight(
						sourceValue ?? fallback[key],
						limit.max,
						fallback[key],
					)
				: clampPipewareInteger(
						sourceValue ?? fallback[key],
						limit.min,
						limit.max,
						fallback[key],
					);
	}
	return normalized;
}

export function normalizePipewareFeatureConfig(config = {}) {
	const type = normalizePipewareFeatureType(config?.type);
	return {
		type,
		rotation: normalizePipewareRotation(config?.rotation ?? 0),
		params: normalizePipewareFeatureParams(type, config?.params),
	};
}

export function createPipewareFeatureConfigFromPlacement(placement) {
	return normalizePipewareFeatureConfig({
		type: placement?.type,
		rotation: placement?.rotation,
		params: placement?.params,
	});
}

export function pipewareFeatureGeometrySticksOut(type, params = {}) {
	const normalizedType = normalizePipewareFeatureType(type);
	return pipewareFeatureBodySticksOut(
		normalizedType,
		normalizePipewareFeatureParams(normalizedType, params),
	);
}

export function pipewarePlacementGeometrySticksOut(placement) {
	const type = normalizePipewareFeatureType(placement?.type);
	return pipewareFeatureGeometrySticksOut(type, placement?.params);
}

function rotateLocalCellCCW(localTx, localTy, width, height) {
	return {
		tx: localTy,
		ty: width - 1 - localTx,
		width: height,
		height: width,
	};
}

function rotateLocalCellCCWNTimes(localTx, localTy, width, height, turns) {
	let tx = localTx;
	let ty = localTy;
	let nextWidth = width;
	let nextHeight = height;
	const normalizedTurns = ((turns % 4) + 4) % 4;
	for (let index = 0; index < normalizedTurns; index++) {
		const rotated = rotateLocalCellCCW(tx, ty, nextWidth, nextHeight);
		tx = rotated.tx;
		ty = rotated.ty;
		nextWidth = rotated.width;
		nextHeight = rotated.height;
	}
	return {
		tx,
		ty,
		width: nextWidth,
		height: nextHeight,
	};
}

function rotateLocalPointCCWNTimes(x, y, width, height, turns) {
	let nextX = x;
	let nextY = y;
	let nextWidth = width;
	let nextHeight = height;
	const normalizedTurns = ((turns % 4) + 4) % 4;
	for (let index = 0; index < normalizedTurns; index++) {
		[nextX, nextY] = [nextY, nextWidth - nextX];
		[nextWidth, nextHeight] = [nextHeight, nextWidth];
	}
	return {
		x: nextX,
		y: nextY,
		width: nextWidth,
		height: nextHeight,
	};
}

function rotateSideCCWNTimes(side, turns) {
	let nextSide = side;
	const normalizedTurns = ((turns % 4) + 4) % 4;
	for (let index = 0; index < normalizedTurns; index++) {
		nextSide = PIPEWARE_SIDE_ROTATE_CCW[nextSide] ?? nextSide;
	}
	return nextSide;
}

function getPipewareRotationTurns(rotation = 0) {
	return normalizePipewareRotation(rotation) / PIPEWARE_ROTATION_STEP;
}

export function getPipewareGridWidthUnits(params = {}) {
	const widthUnits = Math.max(1, Math.round(Number(params.widthUnits) || 1));
	return widthUnits;
}

export function getPipewareChannelThicknessUnits(params = {}) {
	const widthUnits = getPipewareGridWidthUnits(params);
	return Math.max(0.56, widthUnits - 0.44);
}

export function getPipewareChannelWidthUnits(params = {}, axis = "x") {
	if (axis === "x" && Number.isFinite(Number(params.widthUnitsX))) {
		return Math.max(1, Math.round(Number(params.widthUnitsX)));
	}
	if (axis === "y" && Number.isFinite(Number(params.widthUnitsY))) {
		return Math.max(1, Math.round(Number(params.widthUnitsY)));
	}
	if (Number.isFinite(Number(params.channelWidthUnits))) {
		return Math.max(1, Math.round(Number(params.channelWidthUnits)));
	}
	return getPipewareGridWidthUnits(params);
}

function pointInsideTJunctionPlacementBand(params, x, y) {
	const legacyWidthUnits = params.widthUnits ?? 1;
	const widthUnitsX = params.widthUnitsX ?? legacyWidthUnits;
	const widthUnitsY = params.widthUnitsY ?? legacyWidthUnits;
	const geometry = getPipewareFeatureBaseGeometry("T", params);
	const centerStart = params.lengthUnitsLeft ?? 0;
	const centerEnd = centerStart + widthUnitsY;
	const inCrossbar =
		x >= 0 &&
		x <= geometry.baseWidth &&
		y >= 0 &&
		y <= widthUnitsX;
	const inStem =
		x >= centerStart &&
		x <= centerEnd &&
		y >= 0 &&
		y <= geometry.baseHeight;
	return inCrossbar || inStem;
}

function pointInsideXJunctionPlacementBand(params, x, y) {
	const legacyWidthUnits = params.widthUnits ?? 1;
	const widthUnitsX = params.widthUnitsX ?? legacyWidthUnits;
	const widthUnitsY = params.widthUnitsY ?? legacyWidthUnits;
	const geometry = getPipewareFeatureBaseGeometry("X", params);
	const centerStartX = params.lengthUnitsLeft ?? 1;
	const centerEndX = centerStartX + widthUnitsY;
	const centerStartY = params.lengthUnitsTop ?? 1;
	const centerEndY = centerStartY + widthUnitsX;
	const inHorizontal =
		x >= 0 &&
		x <= geometry.baseWidth &&
		y >= centerStartY &&
		y <= centerEndY;
	const inVertical =
		x >= centerStartX &&
		x <= centerEndX &&
		y >= 0 &&
		y <= geometry.baseHeight;
	return inHorizontal || inVertical;
}

function distancePointToSegment(px, py, ax, ay, bx, by) {
	const dx = bx - ax;
	const dy = by - ay;
	if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) {
		return Math.hypot(px - ax, py - ay);
	}
	const t = Math.max(
		0,
		Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)),
	);
	const nearestX = ax + dx * t;
	const nearestY = ay + dy * t;
	return Math.hypot(px - nearestX, py - nearestY);
}

function pointInsideBasePlacementBand(type, params, x, y) {
	if (type === "T") {
		return pointInsideTJunctionPlacementBand(params, x, y);
	}
	if (type === "X") {
		return pointInsideXJunctionPlacementBand(params, x, y);
	}
	return pointInsidePipewareBaseGeometryBand(
		getPipewareFeatureBaseGeometry(type, params),
		x,
		y,
	);
}

function getBaseFootprintCells(type, params, width, height) {
	const cells = [];
	for (let ty = 0; ty < height; ty++) {
		for (let tx = 0; tx < width; tx++) {
			let touched = false;
			for (
				let sampleY = 0;
				sampleY < PIPEWARE_FOOTPRINT_SAMPLE_RESOLUTION && !touched;
				sampleY++
			) {
				for (
					let sampleX = 0;
					sampleX < PIPEWARE_FOOTPRINT_SAMPLE_RESOLUTION;
					sampleX++
				) {
					if (
						pointInsideBasePlacementBand(
							type,
							params,
							tx + (sampleX + 0.5) / PIPEWARE_FOOTPRINT_SAMPLE_RESOLUTION,
							ty + (sampleY + 0.5) / PIPEWARE_FOOTPRINT_SAMPLE_RESOLUTION,
						)
					) {
						touched = true;
						break;
					}
				}
			}
			if (touched) {
				cells.push({ tx, ty });
			}
		}
	}
	return cells;
}

function getBasePlacementPathCells(placement) {
	const type = normalizePipewareFeatureType(placement.type);
	const params = normalizePipewareFeatureParams(type, placement.params);
	const geometry = getPipewareFeatureBaseGeometry(type, params);
	return {
		width: geometry.baseWidth,
		height: geometry.baseHeight,
		cells: getBaseFootprintCells(type, params, geometry.baseWidth, geometry.baseHeight),
	};
}

function getBasePlacementDimensions(placement) {
	const type = normalizePipewareFeatureType(placement.type);
	const params = normalizePipewareFeatureParams(type, placement.params);
	const geometry = getPipewareFeatureBaseGeometry(type, params);
	return {
		type,
		params,
		width: geometry.baseWidth,
		height: geometry.baseHeight,
	};
}

export function getPipewarePlacementBounds(placement) {
	const { anchor } = placement;
	const tx = anchor?.tx ?? 0;
	const ty = anchor?.ty ?? 0;
	const base = getBasePlacementDimensions(placement);
	const rotated = rotateLocalCellCCWNTimes(
		0,
		0,
		base.width,
		base.height,
		getPipewareRotationTurns(placement.rotation),
	);
	return { tx, ty, width: rotated.width, height: rotated.height };
}

export function createPipewarePlacementBandTester(placement) {
	const base = getBasePlacementDimensions(placement);
	const bounds = getPipewarePlacementBounds(placement);
	const turns = getPipewareRotationTurns(placement.rotation);
	return (x, y) => {
		const localX = x - bounds.tx;
		const localY = y - bounds.ty;
		const basePoint = rotateLocalPointCCWNTimes(
			localX,
			localY,
			bounds.width,
			bounds.height,
			(4 - turns) % 4,
		);
		return pointInsideBasePlacementBand(
			base.type,
			base.params,
			basePoint.x,
			basePoint.y,
		);
	};
}

export function pointInsidePipewarePlacementBand(placement, x, y) {
	const testPlacementBand = createPipewarePlacementBandTester(placement);
	return testPlacementBand(x, y);
}

export function getPipewarePlacementPathCells(placement) {
	const base = getBasePlacementPathCells(placement);
	const turns = getPipewareRotationTurns(placement.rotation);
	return base.cells.map((cell) => {
		const rotated = rotateLocalCellCCWNTimes(
			cell.tx,
			cell.ty,
			base.width,
			base.height,
			turns,
		);
		return {
			tx: rotated.tx,
			ty: rotated.ty,
		};
	});
}

export function getPipewarePlacementFootprintCells(placement) {
	const anchorTx = placement.anchor?.tx ?? 0;
	const anchorTy = placement.anchor?.ty ?? 0;
	return getPipewarePlacementPathCells(placement).map((cell) => ({
		tx: anchorTx + cell.tx,
		ty: anchorTy + cell.ty,
	}));
}

export function mapPipewareEdgeKeyToWorld(placement, edgeKey) {
	const parsed = parsePipewareEdgeKey(edgeKey);
	if (!parsed) return null;
	return buildPipewareEdgeKey(
		(placement.anchor?.tx ?? 0) + parsed.tx,
		(placement.anchor?.ty ?? 0) + parsed.ty,
		parsed.side,
	);
}

export function rotatePipewareEdgeKeyCCW(edgeKey, width, height, turns = 1) {
	const parsed = parsePipewareEdgeKey(edgeKey);
	if (!parsed) return null;
	const rotated = rotateLocalPointCCWNTimes(
		parsed.tx,
		parsed.ty,
		width,
		height,
		turns,
	);
	return buildPipewareEdgeKey(
		rotated.x,
		rotated.y,
		rotateSideCCWNTimes(parsed.side, turns),
	);
}

export function translatePipewareEdgeKey(edgeKey, deltaTx = 0, deltaTy = 0) {
	const parsed = parsePipewareEdgeKey(edgeKey);
	if (!parsed) return null;
	return buildPipewareEdgeKey(
		parsed.tx + deltaTx,
		parsed.ty + deltaTy,
		parsed.side,
	);
}

function createLineLocal(start, end) {
	return { start, end };
}

function createStraightOpeningLineLocal(
	edgeKey,
	edgeInset = PIPEWARE_OPENING_EDGE_INSET_UNITS,
	lineHalfLength = PIPEWARE_OPENING_LINE_LENGTH_UNITS / 2,
) {
	const parsed = parsePipewareEdgeKey(edgeKey);
	if (!parsed) return null;
	switch (parsed.side) {
		case "N":
			return createLineLocal(
				{ x: parsed.tx - lineHalfLength, y: parsed.ty + edgeInset },
				{ x: parsed.tx + lineHalfLength, y: parsed.ty + edgeInset },
			);
		case "S":
			return createLineLocal(
				{ x: parsed.tx - lineHalfLength, y: parsed.ty - edgeInset },
				{ x: parsed.tx + lineHalfLength, y: parsed.ty - edgeInset },
			);
		case "E":
			return createLineLocal(
				{ x: parsed.tx - edgeInset, y: parsed.ty - lineHalfLength },
				{ x: parsed.tx - edgeInset, y: parsed.ty + lineHalfLength },
			);
		case "W":
			return createLineLocal(
				{ x: parsed.tx + edgeInset, y: parsed.ty - lineHalfLength },
				{ x: parsed.tx + edgeInset, y: parsed.ty + lineHalfLength },
			);
		default:
			return null;
	}
}

function createOpeningLineFromBasePoint(
	edgePoint,
	tangent,
	outsideNormal,
	geometry,
	rotationTurns,
	edgeInset = PIPEWARE_OPENING_EDGE_INSET_UNITS,
	lineHalfLength = PIPEWARE_OPENING_LINE_LENGTH_UNITS / 2,
) {
	const basePoint = {
		x: edgePoint.x - outsideNormal.x * edgeInset,
		y: edgePoint.y - outsideNormal.y * edgeInset,
	};
	const startBase = {
		x: basePoint.x - tangent.x * lineHalfLength,
		y: basePoint.y - tangent.y * lineHalfLength,
	};
	const endBase = {
		x: basePoint.x + tangent.x * lineHalfLength,
		y: basePoint.y + tangent.y * lineHalfLength,
	};
	return createLineLocal(
		rotateLocalPointCCWNTimes(
			startBase.x,
			startBase.y,
			geometry.baseWidth,
			geometry.baseHeight,
			rotationTurns,
		),
		rotateLocalPointCCWNTimes(
			endBase.x,
			endBase.y,
			geometry.baseWidth,
			geometry.baseHeight,
			rotationTurns,
		),
	);
}

function getPipewareCrossOpeningOutsideNormal(side) {
	switch (side) {
		case "CNW":
			return { x: -1, y: -1 };
		case "CNE":
			return { x: 1, y: -1 };
		case "CSW":
			return { x: -1, y: 1 };
		case "CSE":
			return { x: 1, y: 1 };
		default:
			return null;
	}
}

function createCrossOpeningLineFromBasePoint(
	edgePoint,
	side,
	geometry,
	rotationTurns,
	edgeInset = PIPEWARE_OPENING_EDGE_INSET_UNITS,
	lineHalfLength = PIPEWARE_OPENING_LINE_LENGTH_UNITS / 2,
) {
	const outside = getPipewareCrossOpeningOutsideNormal(side);
	if (!outside) return null;
	const invSqrt2 = Math.SQRT1_2;
	const inward = {
		x: -outside.x * invSqrt2,
		y: -outside.y * invSqrt2,
	};
	const tangent = {
		x: -inward.y,
		y: inward.x,
	};
	return createOpeningLineFromBasePoint(
		edgePoint,
		tangent,
		{ x: outside.x * invSqrt2, y: outside.y * invSqrt2 },
		geometry,
		rotationTurns,
		edgeInset,
		lineHalfLength,
	);
}

function createJunctionOpeningLineLocal(
	placement,
	edgeKey,
	edgeInset = PIPEWARE_OPENING_EDGE_INSET_UNITS,
	lineHalfLength = PIPEWARE_OPENING_LINE_LENGTH_UNITS / 2,
) {
	const parsed = parsePipewareEdgeKey(edgeKey);
	if (!parsed) return null;
	const type = normalizePipewareFeatureType(placement?.type);
	if (type !== "T" && type !== "X") return null;
	const params = normalizePipewareFeatureParams(type, placement?.params);
	const geometry = getPipewareFeatureBaseGeometry(type, params);
	const rotationTurns = getPipewareRotationTurns(placement.rotation);
	const boundsWidth =
		rotationTurns % 2 === 0 ? geometry.baseWidth : geometry.baseHeight;
	const boundsHeight =
		rotationTurns % 2 === 0 ? geometry.baseHeight : geometry.baseWidth;
	const edgePoint = rotateLocalPointCCWNTimes(
		parsed.tx,
		parsed.ty,
		boundsWidth,
		boundsHeight,
		(4 - rotationTurns) % 4,
	);

	switch (parsed.side) {
		case "HT":
			return createOpeningLineFromBasePoint(
				edgePoint,
				{ x: 1, y: 0 },
				{ x: 0, y: -1 },
				geometry,
				rotationTurns,
				edgeInset,
				lineHalfLength,
			);
		case "HB":
			return createOpeningLineFromBasePoint(
				edgePoint,
				{ x: 1, y: 0 },
				{ x: 0, y: 1 },
				geometry,
				rotationTurns,
				edgeInset,
				lineHalfLength,
			);
		case "VL":
			return createOpeningLineFromBasePoint(
				edgePoint,
				{ x: 0, y: 1 },
				{ x: -1, y: 0 },
				geometry,
				rotationTurns,
				edgeInset,
				lineHalfLength,
			);
		case "VR":
			return createOpeningLineFromBasePoint(
				edgePoint,
				{ x: 0, y: 1 },
				{ x: 1, y: 0 },
				geometry,
				rotationTurns,
				edgeInset,
				lineHalfLength,
			);
		default:
			return createCrossOpeningLineFromBasePoint(
				edgePoint,
				parsed.side,
				geometry,
				rotationTurns,
				edgeInset,
				lineHalfLength,
			);
	}
}

function createLOpeningLineLocal(
	placement,
	edgeKey,
	edgeInset = PIPEWARE_OPENING_EDGE_INSET_UNITS,
	lineHalfLength = PIPEWARE_OPENING_LINE_LENGTH_UNITS / 2,
) {
	const parsed = parsePipewareEdgeKey(edgeKey);
	if (!parsed) return null;
	const rotationTurns = getPipewareRotationTurns(placement.rotation);
	const params = normalizePipewareFeatureParams("L", placement.params);
	const geometry = getBasePipewareLGeometry(params);
	const boundsWidth =
		rotationTurns % 2 === 0 ? geometry.baseWidth : geometry.baseHeight;
	const boundsHeight =
		rotationTurns % 2 === 0 ? geometry.baseHeight : geometry.baseWidth;
	const edgePoint = rotateLocalPointCCWNTimes(
		parsed.tx,
		parsed.ty,
		boundsWidth,
		boundsHeight,
		(4 - rotationTurns) % 4,
	);
	const dx = edgePoint.x - geometry.center.x;
	const dy = edgePoint.y - geometry.center.y;
	const radius = Math.hypot(dx, dy);
	const angle = Math.atan2(dy, dx);
	const onArc =
		radius > 0.0001 &&
		angle >= -Math.PI / 2 - 0.001 &&
		angle <= 0.001 &&
		edgePoint.x >= geometry.center.x - 0.001 &&
		edgePoint.y <= geometry.center.y + 0.001;
	let basePoint = { ...edgePoint };
	let tangent = { x: 1, y: 0 };
	if (onArc) {
		const radialDirection = parsed.side === "R" ? 1 : -1;
		basePoint = {
			x: edgePoint.x + Math.cos(angle) * edgeInset * radialDirection,
			y: edgePoint.y + Math.sin(angle) * edgeInset * radialDirection,
		};
		tangent = { x: -Math.sin(angle), y: Math.cos(angle) };
	} else if (
		Math.abs(edgePoint.x - geometry.baseWidth) < 0.001 ||
		Math.abs(edgePoint.x - (geometry.baseWidth - geometry.widthUnits)) < 0.001
	) {
		basePoint = {
			x: edgePoint.x + (parsed.side === "R" ? edgeInset : -edgeInset),
			y: edgePoint.y,
		};
		tangent = { x: 0, y: 1 };
	} else {
		basePoint = {
			x: edgePoint.x,
			y: edgePoint.y + (parsed.side === "R" ? -edgeInset : edgeInset),
		};
	}
	const startBase = {
		x: basePoint.x - tangent.x * lineHalfLength,
		y: basePoint.y - tangent.y * lineHalfLength,
	};
	const endBase = {
		x: basePoint.x + tangent.x * lineHalfLength,
		y: basePoint.y + tangent.y * lineHalfLength,
	};
	return createLineLocal(
		rotateLocalPointCCWNTimes(
			startBase.x,
			startBase.y,
			geometry.baseWidth,
			geometry.baseHeight,
			rotationTurns,
		),
		rotateLocalPointCCWNTimes(
			endBase.x,
			endBase.y,
			geometry.baseWidth,
			geometry.baseHeight,
			rotationTurns,
		),
	);
}

function createGenericOpeningLineLocal(
	placement,
	edgeKey,
	edgeInset = PIPEWARE_OPENING_EDGE_INSET_UNITS,
	lineHalfLength = PIPEWARE_OPENING_LINE_LENGTH_UNITS / 2,
) {
	const parsed = parsePipewareEdgeKey(edgeKey);
	if (!parsed) return null;
	const type = normalizePipewareFeatureType(placement?.type);
	const params = normalizePipewareFeatureParams(type, placement?.params);
	const geometry = getPipewareFeatureBaseGeometry(type, params);
	const rotationTurns = getPipewareRotationTurns(placement.rotation);
	const boundsWidth =
		rotationTurns % 2 === 0 ? geometry.baseWidth : geometry.baseHeight;
	const boundsHeight =
		rotationTurns % 2 === 0 ? geometry.baseHeight : geometry.baseWidth;
	const edgePoint = rotateLocalPointCCWNTimes(
		parsed.tx,
		parsed.ty,
		boundsWidth,
		boundsHeight,
		(4 - rotationTurns) % 4,
	);
	const sample = findNearestPipewareBaseSideSample(
		geometry,
		edgePoint,
		parsed.side,
	);
	if (!sample) {
		return createStraightOpeningLineLocal(
			edgeKey,
			edgeInset,
			lineHalfLength,
		);
	}

	const basePoint = {
		x: sample.x - sample.outsideNormal.x * edgeInset,
		y: sample.y - sample.outsideNormal.y * edgeInset,
	};
	const startBase = {
		x: basePoint.x - sample.tangent.x * lineHalfLength,
		y: basePoint.y - sample.tangent.y * lineHalfLength,
	};
	const endBase = {
		x: basePoint.x + sample.tangent.x * lineHalfLength,
		y: basePoint.y + sample.tangent.y * lineHalfLength,
	};
	return createLineLocal(
		rotateLocalPointCCWNTimes(
			startBase.x,
			startBase.y,
			geometry.baseWidth,
			geometry.baseHeight,
			rotationTurns,
		),
		rotateLocalPointCCWNTimes(
			endBase.x,
			endBase.y,
			geometry.baseWidth,
			geometry.baseHeight,
			rotationTurns,
		),
	);
}

function createOffsetBendOpeningLineLocal(
	placement,
	edgeKey,
	edgeInset = PIPEWARE_OPENING_EDGE_INSET_UNITS,
	lineHalfLength = PIPEWARE_OPENING_LINE_LENGTH_UNITS / 2,
) {
	const parsed = parsePipewareEdgeKey(edgeKey);
	if (!parsed || (parsed.side !== "L" && parsed.side !== "R")) return null;
	const type = normalizePipewareFeatureType(placement?.type);
	if (type !== "S" && type !== "D") return null;
	const params = normalizePipewareFeatureParams(type, placement?.params);
	const geometry = getPipewareFeatureBaseGeometry(type, params);
	const layout = getOffsetBendLayout(type, params);
	const rotationTurns = getPipewareRotationTurns(placement.rotation);
	const boundsWidth =
		rotationTurns % 2 === 0 ? geometry.baseWidth : geometry.baseHeight;
	const boundsHeight =
		rotationTurns % 2 === 0 ? geometry.baseHeight : geometry.baseWidth;
	const edgePoint = rotateLocalPointCCWNTimes(
		parsed.tx,
		parsed.ty,
		boundsWidth,
		boundsHeight,
		(4 - rotationTurns) % 4,
	);
	const halfWidth = layout.widthUnits / 2;
	const sideSign = parsed.side === "L" ? -1 : 1;
	const sideXForCenter = (centerX) => centerX + sideSign * halfWidth;
	const candidates = [];
	const pushRunCandidate = (centerX, startY, endY) => {
		if (endY - startY <= 0.0001) return;
		const x = sideXForCenter(centerX);
		const y = Math.max(startY, Math.min(endY, edgePoint.y));
		candidates.push({
			point: { x, y },
			distance: (edgePoint.x - x) ** 2 + (edgePoint.y - y) ** 2,
		});
	};
	pushRunCandidate(layout.start.x, layout.start.y, layout.firstCorner.y);
	pushRunCandidate(layout.end.x, layout.secondCorner.y, layout.end.y);
	const best = candidates.reduce(
		(currentBest, candidate) =>
			!currentBest || candidate.distance < currentBest.distance
				? candidate
				: currentBest,
		null,
	);
	if (!best || best.distance > 0.05 ** 2) return null;
	return createOpeningLineFromBasePoint(
		best.point,
		{ x: 0, y: 1 },
		{ x: sideSign, y: 0 },
		geometry,
		rotationTurns,
		edgeInset,
		lineHalfLength,
	);
}

function normalFromPathTangent(tangent, side) {
	const sideSign = side === "L" ? 1 : -1;
	return { x: -tangent.y * sideSign, y: tangent.x * sideSign };
}

function createOffsetBendOpeningPathLocalPoints(
	placement,
	edgeKey,
	options = {},
) {
	const parsed = parsePipewareEdgeKey(edgeKey);
	if (!parsed || (parsed.side !== "L" && parsed.side !== "R")) return null;
	const type = normalizePipewareFeatureType(placement?.type);
	if (type !== "S" && type !== "D") return null;
	const tileSize = Number(options.tileSize);
	const hasTileSize = Number.isFinite(tileSize) && tileSize > 0;
	const edgeInset =
		options.edgeInsetUnits ??
		(hasTileSize
			? getPipewareOpeningCutCenterInsetUnits(tileSize)
			: PIPEWARE_OPENING_EDGE_INSET_UNITS);
	const halfLine =
		options.lineHalfLengthUnits ??
		(hasTileSize
			? getPipewareOpeningCutHalfWidthUnits(tileSize)
			: PIPEWARE_OPENING_LINE_LENGTH_UNITS / 2);
	const params = normalizePipewareFeatureParams(type, placement?.params);
	const geometry = getPipewareFeatureBaseGeometry(type, params);
	const rotationTurns = getPipewareRotationTurns(placement.rotation);
	const boundsWidth =
		rotationTurns % 2 === 0 ? geometry.baseWidth : geometry.baseHeight;
	const boundsHeight =
		rotationTurns % 2 === 0 ? geometry.baseHeight : geometry.baseWidth;
	const edgePoint = rotateLocalPointCCWNTimes(
		parsed.tx,
		parsed.ty,
		boundsWidth,
		boundsHeight,
		(4 - rotationTurns) % 4,
	);
	const sample = findNearestPipewareBaseSideSample(
		geometry,
		edgePoint,
		parsed.side,
	);
	if (
		!sample?.segment ||
		!Number.isFinite(sample.t)
	) {
		return createOffsetBendOpeningLineLocal(
			placement,
			edgeKey,
			edgeInset,
			halfLine,
		);
	}

	const halfWidth = geometry.widthUnits / 2;
	const point = pointAtPipewareSegment(sample.segment, sample.t);
	const tangent = tangentAtPipewareSegment(sample.segment, sample.t);
	const normal = normalFromPathTangent(tangent, sample.side);
	const center = {
		x: point.x + normal.x * (halfWidth - edgeInset),
		y: point.y + normal.y * (halfWidth - edgeInset),
	};
	const startBase = {
		x: center.x - tangent.x * halfLine,
		y: center.y - tangent.y * halfLine,
	};
	const endBase = {
		x: center.x + tangent.x * halfLine,
		y: center.y + tangent.y * halfLine,
	};
	return [
		rotateLocalPointCCWNTimes(
			startBase.x,
			startBase.y,
			geometry.baseWidth,
			geometry.baseHeight,
			rotationTurns,
		),
		rotateLocalPointCCWNTimes(
			endBase.x,
			endBase.y,
			geometry.baseWidth,
			geometry.baseHeight,
			rotationTurns,
		),
	];
}

export function getPipewareOpeningPathLocalPoints(
	placement,
	edgeKey,
	options = {},
) {
	const type = normalizePipewareFeatureType(placement?.type);
	if (type === "S" || type === "D") {
		return createOffsetBendOpeningPathLocalPoints(
			placement,
			edgeKey,
			options,
		);
	}
	const line = getPipewareOpeningLineLocal(placement, edgeKey, options);
	return line ? [line.start, line.end] : null;
}

export function getPipewareOpeningLineLocal(placement, edgeKey, options = {}) {
	const type = normalizePipewareFeatureType(placement?.type);
	const edgeInset =
		options.edgeInsetUnits ?? PIPEWARE_OPENING_EDGE_INSET_UNITS;
	const tileSize = Number(options.tileSize);
	const hasTileSize = Number.isFinite(tileSize) && tileSize > 0;
	const lineHalfLength =
		options.lineHalfLengthUnits ??
		(hasTileSize
			? getPipewareOpeningCutHalfWidthUnits(tileSize)
			: PIPEWARE_OPENING_LINE_LENGTH_UNITS / 2);
	if (type === "L") {
		return createLOpeningLineLocal(
			placement,
			edgeKey,
			edgeInset,
			lineHalfLength,
		);
	}
	if (type === "I") {
		return createStraightOpeningLineLocal(
			edgeKey,
			edgeInset,
			lineHalfLength,
		);
	}
	if (type === "T" || type === "X") {
		return createJunctionOpeningLineLocal(
			placement,
			edgeKey,
			edgeInset,
			lineHalfLength,
		);
	}
	if (type === "S" || type === "D") {
		const offsetBendEdgeInset =
			options.edgeInsetUnits ??
			(hasTileSize
				? getPipewareOpeningCutCenterInsetUnits(tileSize)
				: edgeInset);
		return createOffsetBendOpeningLineLocal(
			placement,
			edgeKey,
			offsetBendEdgeInset,
			lineHalfLength,
		);
	}
	return createGenericOpeningLineLocal(
		placement,
		edgeKey,
		edgeInset,
		lineHalfLength,
	);
}

function getPipewareEdgeKeyWorldPoint(placement, edgeKey) {
	const parsed = parsePipewareEdgeKey(edgeKey);
	if (!parsed) return null;
	return {
		x: (placement.anchor?.tx ?? 0) + parsed.tx,
		y: (placement.anchor?.ty ?? 0) + parsed.ty,
		side: parsed.side,
	};
}

function pushPipewareIntegerRangeEdges(
	pushEdge,
	start,
	end,
	side,
	getPoint,
	options = {},
) {
	const includeStart = options.includeStart ?? true;
	const includeEnd = options.includeEnd ?? true;
	for (let index = start; index <= end; index++) {
		if (index === start && !includeStart) continue;
		if (index === end && !includeEnd) continue;
		const point = getPoint(index);
		pushEdge(point.x, point.y, side);
	}
}

function getBaseTJunctionPlacementEdgeKeys(params) {
	const geometry = getPipewareFeatureBaseGeometry("T", params);
	const edgeKeys = [];
	const seen = new Set();
	const pushEdge = (tx, ty, side) => {
		const edgeKey = buildPipewareEdgeKey(tx, ty, side);
		if (seen.has(edgeKey)) return;
		seen.add(edgeKey);
		edgeKeys.push(edgeKey);
	};
	const legacyWidthUnits = params.widthUnits ?? 1;
	const widthUnitsX = params.widthUnitsX ?? legacyWidthUnits;
	const widthUnitsY = params.widthUnitsY ?? legacyWidthUnits;
	const left = params.lengthUnitsLeft ?? 0;
	const right = params.lengthUnitsRight ?? 0;
	const centerStart = left;
	const centerEnd = left + widthUnitsY;
	const baseWidth = geometry.baseWidth;
	const baseHeight = geometry.baseHeight;

	pushPipewareIntegerRangeEdges(
		pushEdge,
		0,
		baseWidth,
		"HT",
		(index) => ({ x: index, y: 0 }),
	);
	if (left > 0) {
		pushPipewareIntegerRangeEdges(
			pushEdge,
			0,
			centerStart,
			"HB",
			(index) => ({ x: index, y: widthUnitsX }),
			{ includeEnd: false },
		);
	}
	if (right > 0) {
		pushPipewareIntegerRangeEdges(
			pushEdge,
			centerEnd,
			baseWidth,
			"HB",
			(index) => ({ x: index, y: widthUnitsX }),
			{ includeStart: false },
		);
	}
	pushPipewareIntegerRangeEdges(
		pushEdge,
		widthUnitsX,
		baseHeight,
		"VL",
		(index) => ({ x: centerStart, y: index }),
		{ includeStart: false },
	);
	pushPipewareIntegerRangeEdges(
		pushEdge,
		widthUnitsX,
		baseHeight,
		"VR",
		(index) => ({ x: centerEnd, y: index }),
		{ includeStart: false },
	);
	pushEdge(centerStart, widthUnitsX, "CSW");
	pushEdge(centerEnd, widthUnitsX, "CSE");

	return edgeKeys;
}

function getBaseXJunctionPlacementEdgeKeys(params) {
	const geometry = getPipewareFeatureBaseGeometry("X", params);
	const edgeKeys = [];
	const seen = new Set();
	const pushEdge = (tx, ty, side) => {
		const edgeKey = buildPipewareEdgeKey(tx, ty, side);
		if (seen.has(edgeKey)) return;
		seen.add(edgeKey);
		edgeKeys.push(edgeKey);
	};
	const legacyWidthUnits = params.widthUnits ?? 1;
	const widthUnitsX = params.widthUnitsX ?? legacyWidthUnits;
	const widthUnitsY = params.widthUnitsY ?? legacyWidthUnits;
	const left = params.lengthUnitsLeft ?? 1;
	const right = params.lengthUnitsRight ?? 1;
	const top = params.lengthUnitsTop ?? 1;
	const bottom = params.lengthUnitsBottom ?? 1;
	const centerStartX = left;
	const centerEndX = left + widthUnitsY;
	const centerStartY = top;
	const centerEndY = top + widthUnitsX;
	const baseWidth = geometry.baseWidth;
	const baseHeight = geometry.baseHeight;

	if (left > 0) {
		pushPipewareIntegerRangeEdges(
			pushEdge,
			0,
			centerStartX,
			"HT",
			(index) => ({ x: index, y: centerStartY }),
			{ includeEnd: false },
		);
		pushPipewareIntegerRangeEdges(
			pushEdge,
			0,
			centerStartX,
			"HB",
			(index) => ({ x: index, y: centerEndY }),
			{ includeEnd: false },
		);
	}
	if (right > 0) {
		pushPipewareIntegerRangeEdges(
			pushEdge,
			centerEndX,
			baseWidth,
			"HT",
			(index) => ({ x: index, y: centerStartY }),
			{ includeStart: false },
		);
		pushPipewareIntegerRangeEdges(
			pushEdge,
			centerEndX,
			baseWidth,
			"HB",
			(index) => ({ x: index, y: centerEndY }),
			{ includeStart: false },
		);
	}
	if (top > 0) {
		pushPipewareIntegerRangeEdges(
			pushEdge,
			0,
			centerStartY,
			"VL",
			(index) => ({ x: centerStartX, y: index }),
			{ includeEnd: false },
		);
		pushPipewareIntegerRangeEdges(
			pushEdge,
			0,
			centerStartY,
			"VR",
			(index) => ({ x: centerEndX, y: index }),
			{ includeEnd: false },
		);
	}
	if (bottom > 0) {
		pushPipewareIntegerRangeEdges(
			pushEdge,
			centerEndY,
			baseHeight,
			"VL",
			(index) => ({ x: centerStartX, y: index }),
			{ includeStart: false },
		);
		pushPipewareIntegerRangeEdges(
			pushEdge,
			centerEndY,
			baseHeight,
			"VR",
			(index) => ({ x: centerEndX, y: index }),
			{ includeStart: false },
		);
	}
	pushEdge(centerStartX, centerStartY, "CNW");
	pushEdge(centerEndX, centerStartY, "CNE");
	pushEdge(centerStartX, centerEndY, "CSW");
	pushEdge(centerEndX, centerEndY, "CSE");

	return edgeKeys;
}

function getBaseOffsetBendPlacementEdgeKeys(type, params) {
	const geometry = getPipewareFeatureBaseGeometry(type, params);
	const edgeKeys = [];
	const seen = new Set();
	const pushEdge = (tx, ty, side) => {
		const edgeKey = buildPipewareEdgeKey(tx, ty, side);
		if (seen.has(edgeKey)) return;
		seen.add(edgeKey);
		edgeKeys.push(edgeKey);
	};
	for (const sample of getPipewareBaseSideSamples(geometry)) {
		pushEdge(sample.x, sample.y, sample.side);
	}
	return edgeKeys;
}

function getPipewareSegmentLength(segment) {
	return Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
}

function getTJunctionCenter(params) {
	const legacyWidthUnits = params.widthUnits ?? 1;
	const widthUnitsX = params.widthUnitsX ?? legacyWidthUnits;
	const widthUnitsY = params.widthUnitsY ?? legacyWidthUnits;
	return {
		x: (params.lengthUnitsLeft ?? 0) + widthUnitsY / 2,
		y: widthUnitsX / 2,
	};
}

function getXJunctionCenter(params) {
	const legacyWidthUnits = params.widthUnits ?? 1;
	const widthUnitsX = params.widthUnitsX ?? legacyWidthUnits;
	const widthUnitsY = params.widthUnitsY ?? legacyWidthUnits;
	return {
		x: (params.lengthUnitsLeft ?? 1) + widthUnitsY / 2,
		y: (params.lengthUnitsTop ?? 1) + widthUnitsX / 2,
	};
}

function getPipewareHookLineSegments(type, params, tileSize) {
	const geometry = getPipewareFeatureBaseGeometry(type, params);
	const segments = [];
	const cornerSafetyUnits =
		Number.isFinite(Number(tileSize)) && Number(tileSize) > 0
			? PIPEWARE_OPENING_WALL_OVERPUNCH / Number(tileSize)
			: 0;
	const pushIfHookable = (segment) => {
		if (getPipewareSegmentLength(segment) * tileSize <= PIPEWARE_GRIP_SIZE) {
			return;
		}
		segments.push(segment);
	};

	if (type === "S" || type === "D") {
		const layout = getOffsetBendLayout(type, params);
		if (layout.isStraight) {
			pushIfHookable({
				start: layout.start,
				end: layout.end,
				widthUnits: layout.widthUnits,
			});
			return segments;
		}
		if ((params.lengthUnitsBottom ?? 0) > 0) {
			pushIfHookable({
				start: layout.start,
				end: layout.firstCorner,
				widthUnits: layout.widthUnits,
				hookSafetyEndUnits: cornerSafetyUnits,
			});
		}
		if ((params.lengthUnitsTop ?? 0) > 0) {
			pushIfHookable({
				start: layout.secondCorner,
				end: layout.end,
				widthUnits: layout.widthUnits,
				hookSafetyStartUnits: cornerSafetyUnits,
			});
		}
		return segments;
	}

	if (type === "T") {
		const center = getTJunctionCenter(params);
		const legacyWidthUnits = params.widthUnits ?? 1;
		const widthUnitsX = params.widthUnitsX ?? legacyWidthUnits;
		const widthUnitsY = params.widthUnitsY ?? legacyWidthUnits;
		const halfWidthX = widthUnitsX / 2;
		pushIfHookable({
			start: { x: 0, y: center.y },
			end: { x: geometry.baseWidth, y: center.y },
			widthUnits: widthUnitsX,
		});
		if ((params.lengthUnitsY ?? 0) > 0) {
			pushIfHookable({
				start: { x: center.x, y: center.y + halfWidthX },
				end: { x: center.x, y: geometry.baseHeight },
				widthUnits: widthUnitsY,
			});
		}
		return segments;
	}

	if (type === "X") {
		const center = getXJunctionCenter(params);
		const legacyWidthUnits = params.widthUnits ?? 1;
		const widthUnitsX = params.widthUnitsX ?? legacyWidthUnits;
		const widthUnitsY = params.widthUnitsY ?? legacyWidthUnits;
		const halfWidthX = widthUnitsX / 2;
		const halfWidthY = widthUnitsY / 2;
		if ((params.lengthUnitsLeft ?? 0) > 0) {
			pushIfHookable({
				start: { x: 0, y: center.y },
				end: { x: center.x - halfWidthY, y: center.y },
				widthUnits: widthUnitsX,
			});
		}
		if ((params.lengthUnitsRight ?? 0) > 0) {
			pushIfHookable({
				start: { x: center.x + halfWidthY, y: center.y },
				end: { x: geometry.baseWidth, y: center.y },
				widthUnits: widthUnitsX,
			});
		}
		if ((params.lengthUnitsTop ?? 0) > 0) {
			pushIfHookable({
				start: { x: center.x, y: 0 },
				end: { x: center.x, y: center.y - halfWidthX },
				widthUnits: widthUnitsY,
			});
		}
		if ((params.lengthUnitsBottom ?? 0) > 0) {
			pushIfHookable({
				start: { x: center.x, y: center.y + halfWidthX },
				end: { x: center.x, y: geometry.baseHeight },
				widthUnits: widthUnitsY,
			});
		}
		return segments;
	}

	for (const path of geometry.centerlinePaths ?? []) {
		for (const segment of path.segments ?? []) {
			if (segment.kind === "line") pushIfHookable(segment);
		}
	}
	return segments;
}

function projectPointToLineSegment(point, segment) {
	const dx = segment.end.x - segment.start.x;
	const dy = segment.end.y - segment.start.y;
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared <= 0.0001) return null;
	const unclampedT =
		((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) /
		lengthSquared;
	const t = Math.max(0, Math.min(1, unclampedT));
	const nearest = {
		x: segment.start.x + dx * t,
		y: segment.start.y + dy * t,
	};
	return {
		t,
		distance: Math.hypot(point.x - nearest.x, point.y - nearest.y),
		along: Math.sqrt(lengthSquared) * t,
		length: Math.sqrt(lengthSquared),
	};
}

function getPipewareEdgePointInBase(placement, edgeKey) {
	const parsed = parsePipewareEdgeKey(edgeKey);
	if (!parsed) return null;
	const base = getBasePlacementDimensions(placement);
	const turns = getPipewareRotationTurns(placement.rotation);
	const boundsWidth = turns % 2 === 0 ? base.width : base.height;
	const boundsHeight = turns % 2 === 0 ? base.height : base.width;
	return rotateLocalPointCCWNTimes(
		parsed.tx,
		parsed.ty,
		boundsWidth,
		boundsHeight,
		(4 - turns) % 4,
	);
}

function openingSpanIntersectsHook(along, length, tileSize, options = {}) {
	const cutHalfLength =
		options.cutHalfLengthUnits ?? PIPEWARE_CORD_CUTOUT_WIDTH / 2 / tileSize;
	const hookSafety =
		(options.hookSafetyMM ?? 0) / tileSize +
		(options.hookSafetyUnits ?? 0);
	const gripStart = PIPEWARE_GRIP_SPACING_FROM_CHANNEL / tileSize;
	const gripEnd =
		(PIPEWARE_GRIP_SPACING_FROM_CHANNEL + PIPEWARE_GRIP_SIZE) / tileSize;
	for (let index = 0; index + gripEnd <= length + 0.0001; index++) {
		const start =
			index + gripStart - (options.hookSafetyStartUnits ?? 0);
		const end = index + gripEnd + (options.hookSafetyEndUnits ?? 0);
		if (
			along + cutHalfLength + hookSafety > start &&
			along - cutHalfLength - hookSafety < end
		) {
			return true;
		}
	}
	return false;
}

function getPipewareHookSideToleranceUnits(tileSize, options = {}) {
	const physicalTileSize = Number(tileSize);
	const toleranceMM =
		options.hookSideToleranceMM ?? PIPEWARE_OPENING_BASE_CUT_DEPTH / 2;
	const toleranceUnits = options.hookSideToleranceUnits ?? 0;
	return (
		(Number.isFinite(physicalTileSize) && physicalTileSize > 0
			? toleranceMM / physicalTileSize
			: 0) + toleranceUnits
	);
}

function isPipewareOpeningEdgeUnderHook(placement, edgeKey, tileSize, options = {}) {
	const parsed = parsePipewareEdgeKey(edgeKey);
	if (!parsed || String(parsed.side).startsWith("C")) return false;
	const type = normalizePipewareFeatureType(placement.type);
	const params = normalizePipewareFeatureParams(type, placement.params);
	const edgePoint = getPipewareEdgePointInBase(placement, edgeKey);
	if (!edgePoint) return false;
	for (const segment of getPipewareHookLineSegments(type, params, tileSize)) {
		const projection = projectPointToLineSegment(edgePoint, segment);
		const maxSideDistance =
			(segment.widthUnits ??
				params.channelWidthUnits ??
				params.widthUnits ??
				1) /
				2 +
			0.1 +
			getPipewareHookSideToleranceUnits(tileSize, options);
		if (!projection || projection.distance > maxSideDistance) continue;
		if (
			openingSpanIntersectsHook(
				projection.along,
				projection.length,
				tileSize,
				{
					...options,
					hookSafetyStartUnits:
						(options.hookSafetyStartUnits ?? 0) +
						(segment.hookSafetyStartUnits ?? 0),
					hookSafetyEndUnits:
						(options.hookSafetyEndUnits ?? 0) +
						(segment.hookSafetyEndUnits ?? 0),
				},
			)
		) {
			return true;
		}
	}
	return false;
}

export function getPipewarePlacementCuttableEdgeKeys(
	placement,
	tileSize,
	options = {},
) {
	return getPipewarePlacementEditableEdgeKeys(placement).filter(
		(edgeKey) =>
			!isPipewareOpeningEdgeUnderHook(placement, edgeKey, tileSize, options),
	);
}

export function remapPipewareEdgeCutsForPlacementChange(
	edgeCuts,
	oldPlacement,
	nextPlacement,
	stickySide = null,
) {
	const explicitStickySide = PIPEWARE_VALID_EDGE_SIDES.has(stickySide)
		? stickySide
		: null;
	const allowedEdges = getPipewarePlacementEditableEdgeKeys(nextPlacement)
		.map((edgeKey) => ({
			edgeKey,
			point: getPipewareEdgeKeyWorldPoint(nextPlacement, edgeKey),
		}))
		.filter((entry) => entry.point);
	const nextEdgeCuts = [];
	const seen = new Set();

	for (const edgeKey of edgeCuts ?? []) {
		const parsed = parsePipewareEdgeKey(edgeKey);
		if (
			!parsed ||
			!PIPEWARE_VALID_EDGE_SIDES.has(parsed.side) ||
			!Number.isFinite(parsed.tx) ||
			!Number.isFinite(parsed.ty)
		) {
			continue;
		}

		const targetPoint = getPipewareEdgeKeyWorldPoint(oldPlacement, edgeKey);
		if (!targetPoint) continue;
		const sameSideCandidates = allowedEdges.filter(
			({ point }) => point.side === parsed.side,
		);
		const stickyCandidates = explicitStickySide
			? sameSideCandidates.filter(({ point }) => point.side === explicitStickySide)
			: sameSideCandidates;
		const fallbackCandidates = stickyCandidates.length
			? stickyCandidates
			: sameSideCandidates.length
				? sameSideCandidates
				: allowedEdges;
		let best = null;
		for (const candidate of fallbackCandidates) {
			const dx = candidate.point.x - targetPoint.x;
			const dy = candidate.point.y - targetPoint.y;
			const distance = dx * dx + dy * dy;
			if (!best || distance < best.distance) {
				best = { edgeKey: candidate.edgeKey, distance };
			}
		}
		if (!best || seen.has(best.edgeKey)) continue;
		seen.add(best.edgeKey);
		nextEdgeCuts.push(best.edgeKey);
	}

	return nextEdgeCuts;
}

function getBasePipewarePlacementEdgeKeys(placement) {
	const type = normalizePipewareFeatureType(placement.type);
	const params = normalizePipewareFeatureParams(type, placement.params);
	const edgeKeys = [];
	const seen = new Set();
	const pushEdge = (tx, ty, side) => {
		const edgeKey = buildPipewareEdgeKey(tx, ty, side);
		if (seen.has(edgeKey)) return;
		seen.add(edgeKey);
		edgeKeys.push(edgeKey);
	};

	if (type === "I") {
		for (let index = 0; index <= params.lengthUnits; index++) {
			pushEdge(index, 0, "N");
			pushEdge(index, params.widthUnits, "S");
		}
		return edgeKeys;
	}

	if (type === "T") {
		return getBaseTJunctionPlacementEdgeKeys(params);
	}

	if (type === "X") {
		return getBaseXJunctionPlacementEdgeKeys(params);
	}

	if (type === "S" || type === "D") {
		return getBaseOffsetBendPlacementEdgeKeys(type, params);
	}

	if (type !== "L") {
		const geometry = getPipewareFeatureBaseGeometry(type, params);
		for (const sample of getPipewareBaseSideSamples(geometry)) {
			pushEdge(sample.x, sample.y, sample.side);
		}
		return edgeKeys;
	}

	const geometry = getBasePipewareLGeometry(params);
	const halfWidth = geometry.widthUnits / 2;
	const outerRadius = geometry.centerlineRadius + halfWidth;
	const innerRadius = Math.max(0, geometry.centerlineRadius - halfWidth);
	for (let index = 0; index <= params.lengthUnitsX; index++) {
		pushEdge(index, 0, "L");
		pushEdge(index, geometry.widthUnits, "R");
	}
	for (let index = 0; index <= geometry.turnSpan; index++) {
		const angle = -Math.PI / 2 + (index / geometry.turnSpan) * (Math.PI / 2);
		pushEdge(
			geometry.center.x + Math.cos(angle) * outerRadius,
			geometry.center.y + Math.sin(angle) * outerRadius,
			"L",
		);
		pushEdge(
			geometry.center.x + Math.cos(angle) * innerRadius,
			geometry.center.y + Math.sin(angle) * innerRadius,
			"R",
		);
	}
	for (let index = 0; index <= params.lengthUnitsY; index++) {
		pushEdge(geometry.baseWidth, geometry.center.y + index, "L");
		pushEdge(
			geometry.baseWidth - geometry.widthUnits,
			geometry.center.y + index,
			"R",
		);
	}
	return edgeKeys;
}

export function getPipewarePlacementEditableEdgeKeys(placement) {
	const base = getBasePlacementDimensions(placement);
	const turns = getPipewareRotationTurns(placement.rotation);
	return getBasePipewarePlacementEdgeKeys(placement)
		.map((edgeKey) =>
			rotatePipewareEdgeKeyCCW(edgeKey, base.width, base.height, turns),
		)
		.filter(Boolean);
}

export function filterPipewarePlacementEdgeCuts(placement, tileSize = null) {
	const physicalTileSize = Number(tileSize);
	const allowed = new Set(
		Number.isFinite(physicalTileSize) && physicalTileSize > 0
			? getPipewarePlacementCuttableEdgeKeys(placement, physicalTileSize)
			: getPipewarePlacementEditableEdgeKeys(placement),
	);
	return (placement.edgeCuts ?? []).filter((edgeKey) => allowed.has(edgeKey));
}

export function normalizePipewarePlacement(placement) {
	const type = normalizePipewareFeatureType(placement?.type);
	const normalized = {
		id: placement?.id ?? "",
		type,
		anchor: {
			tx: Math.max(0, Math.round(Number(placement?.anchor?.tx) || 0)),
			ty: Math.max(0, Math.round(Number(placement?.anchor?.ty) || 0)),
		},
		rotation: normalizePipewareRotation(placement?.rotation ?? 0),
		params: normalizePipewareFeatureParams(type, placement?.params),
		edgeCuts: Array.isArray(placement?.edgeCuts)
			? placement.edgeCuts.map(String)
			: [],
	};
	normalized.edgeCuts = filterPipewarePlacementEdgeCuts(normalized);
	return normalized;
}
