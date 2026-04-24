import { $ } from "refui";
import { PIPEWARE_EDITOR_2D_RENDERERS } from "./renderers.jsx";
import {
	createPipewareBoundsRect,
	createPipewareOpeningHint,
} from "./placement-state.js";
import {
	getBasePipewareLGeometry,
	getPipewareChannelThicknessUnits,
	getPipewareChannelWidthUnits,
	getPipewareOpeningLineLocal,
	getPipewareOpeningPathLocalPoints,
	getPipewarePlacementCuttableEdgeKeys,
	mapPipewareEdgeKeyToWorld,
	normalizePipewareRotation,
	parsePipewareEdgeKey,
} from "./feature-library.js";
import {
	getPipewareOpeningCutHalfWidthUnits,
	PIPEWARE_OPENING_MASK_STROKE_UNITS,
	PIPEWARE_PORT_OPENING_INSET_UNITS,
} from "./constants.js";
import {
	getPipewareFeatureBaseGeometry,
	getOffsetBendLayout,
	pointAtPipewareSegment,
	samplePipewarePathPoints,
} from "./feature-paths.js";

const EDITOR_2D_RESIZE_BUTTON_OFFSET = 20;
const PIPEWARE_OPENING_HIT_PADDING = 7;
const PIPEWARE_OPENING_MERGE_DISTANCE_UNITS = 0.45;
const PIPEWARE_EDITOR_OPENING_EDGE_INSET_UNITS = 0.1;
const PIPEWARE_EDITOR_BODY_WIDTH_BOOST_UNITS = 0.12;
const PIPEWARE_EDITOR_OPENING_WIDTH_SCALE = 0.6;
const PIPEWARE_DIRECTION_MARKER_SIZE_UNITS = 0.12;
const PIPEWARE_PARAMETER_HANDLE_MIN_GAP_UNITS = 0.34;

function getEditorOpeningHalfWidthUnits(physicalTileSize) {
	return (
		getPipewareOpeningCutHalfWidthUnits(physicalTileSize) *
		PIPEWARE_EDITOR_OPENING_WIDTH_SCALE
	);
}

function getChannelThickness(tileSize, params) {
	return (
		tileSize *
		(getPipewareChannelThicknessUnits(params) +
			PIPEWARE_EDITOR_BODY_WIDTH_BOOST_UNITS)
	);
}

function getPathChannelThickness(tileSize, params, path) {
	const axis =
		path?.id?.includes("vertical") || path?.id?.includes("stem") ? "y" : "x";
	const widthUnits = path?.widthUnits ?? getPipewareChannelWidthUnits(params, axis);
	return (
		tileSize *
		(Math.max(0.56, widthUnits - 0.44) + PIPEWARE_EDITOR_BODY_WIDTH_BOOST_UNITS)
	);
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
	return { x: nextX, y: nextY, width: nextWidth, height: nextHeight };
}

function localPointToPixels(point, placement, tileSize, pad) {
	return {
		x: pad + ((placement.anchor?.tx ?? 0) + point.x) * tileSize,
		y: pad + ((placement.anchor?.ty ?? 0) + point.y) * tileSize,
	};
}

function pointDistance(a, b) {
	return Math.hypot(b.x - a.x, b.y - a.y);
}

function movePointToward(start, end, distance) {
	const length = pointDistance(start, end);
	if (length <= 0.0001) return { ...start };
	const ratio = Math.min(1, distance / length);
	return {
		x: start.x + (end.x - start.x) * ratio,
		y: start.y + (end.y - start.y) * ratio,
	};
}

function createPathBoundingBox(points, padding = 0) {
	if (!points.length) return null;
	const xs = points.map((point) => point.x);
	const ys = points.map((point) => point.y);
	const minX = Math.min(...xs) - padding;
	const maxX = Math.max(...xs) + padding;
	const minY = Math.min(...ys) - padding;
	const maxY = Math.max(...ys) + padding;
	return {
		x: minX,
		y: minY,
		w: maxX - minX,
		h: maxY - minY,
	};
}

function createLocalRectPixelBounds(
	rect,
	placement,
	baseWidth,
	baseHeight,
	rotationTurns,
	tileSize,
	pad,
) {
	const points = [
		{ x: rect.x, y: rect.y },
		{ x: rect.x + rect.w, y: rect.y },
		{ x: rect.x + rect.w, y: rect.y + rect.h },
		{ x: rect.x, y: rect.y + rect.h },
	].map((point) => {
		const rotated = rotateLocalPointCCWNTimes(
			point.x,
			point.y,
			baseWidth,
			baseHeight,
			rotationTurns,
		);
		return localPointToPixels(rotated, placement, tileSize, pad);
	});
	return createPathBoundingBox(points);
}

function createLineCenterlineFromLocalPoints(
	placement,
	start,
	end,
	tileSize,
	pad,
) {
	const startPx = localPointToPixels(start, placement, tileSize, pad);
	const endPx = localPointToPixels(end, placement, tileSize, pad);
	return {
		d: `M ${startPx.x} ${startPx.y} L ${endPx.x} ${endPx.y}`,
		bbox: createPathBoundingBox([startPx, endPx], PIPEWARE_OPENING_HIT_PADDING),
		points: [startPx, endPx],
	};
}

function createLineCenterlineFromPixelCenter(
	center,
	tangent,
	length,
	padding = PIPEWARE_OPENING_HIT_PADDING,
) {
	const tangentLength = Math.hypot(tangent.x, tangent.y);
	const unit =
		tangentLength <= 0.0001
			? { x: 1, y: 0 }
			: { x: tangent.x / tangentLength, y: tangent.y / tangentLength };
	const halfLength = length / 2;
	const start = {
		x: center.x - unit.x * halfLength,
		y: center.y - unit.y * halfLength,
	};
	const end = {
		x: center.x + unit.x * halfLength,
		y: center.y + unit.y * halfLength,
	};
	return {
		d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
		bbox: createPathBoundingBox([start, end], padding),
		points: [start, end],
	};
}

function createPathCenterlineFromLocalPoints(placement, points, tileSize, pad) {
	const pixelPoints = points.map((point) =>
		localPointToPixels(point, placement, tileSize, pad),
	);
	return {
		d: pathPointsToSvgPath(pixelPoints),
		bbox: createPathBoundingBox(pixelPoints, PIPEWARE_OPENING_HIT_PADDING),
		points: pixelPoints,
	};
}

function rotatePlacementBasePoint(point, baseWidth, baseHeight, rotationTurns) {
	return rotateLocalPointCCWNTimes(
		point.x,
		point.y,
		baseWidth,
		baseHeight,
		rotationTurns,
	);
}

function rotateLocalVectorCCWNTimes(vector, width, height, turns) {
	const origin = rotateLocalPointCCWNTimes(0, 0, width, height, turns);
	const target = rotateLocalPointCCWNTimes(
		vector.x,
		vector.y,
		width,
		height,
		turns,
	);
	return {
		x: target.x - origin.x,
		y: target.y - origin.y,
	};
}

function movePointAlongPath(points, fromStart, distance) {
	if (points.length < 2 || distance <= 0) {
		return points[fromStart ? 0 : points.length - 1];
	}
	let remaining = distance;
	let index = fromStart ? 0 : points.length - 1;
	while (fromStart ? index < points.length - 1 : index > 0) {
		const nextIndex = fromStart ? index + 1 : index - 1;
		const current = points[index];
		const next = points[nextIndex];
		const length = pointDistance(current, next);
		if (length >= remaining) {
			return movePointToward(current, next, remaining);
		}
		remaining -= length;
		index = nextIndex;
	}
	return points[index];
}

function pathPointsToSvgPath(points) {
	if (!points.length) return "";
	return points
		.map((point, index) =>
			index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`,
		)
		.join(" ");
}

function normalizePointVector(start, end) {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const length = Math.hypot(dx, dy);
	if (length <= 0.0001) return null;
	return { x: dx / length, y: dy / length };
}

function normalizeVector(vector) {
	const length = Math.hypot(vector.x, vector.y);
	if (length <= 0.0001) return null;
	return { x: vector.x / length, y: vector.y / length };
}

function createDirectionTrianglePath(tip, direction, size) {
	const normal = { x: -direction.y, y: direction.x };
	const base = {
		x: tip.x - direction.x * size * 0.78,
		y: tip.y - direction.y * size * 0.78,
	};
	const halfBase = size * 0.82;
	const left = {
		x: base.x + normal.x * halfBase,
		y: base.y + normal.y * halfBase,
	};
	const right = {
		x: base.x - normal.x * halfBase,
		y: base.y - normal.y * halfBase,
	};
	return `M ${tip.x} ${tip.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`;
}

function createDirectionMarkersFromPathPoints(points, tileSize, idPrefix) {
	const filteredPoints = [];
	for (const point of points) {
		const previous = filteredPoints[filteredPoints.length - 1];
		if (!previous || pointDistance(previous, point) > 0.01) {
			filteredPoints.push(point);
		}
	}
	if (filteredPoints.length < 2) return [];
	const first = filteredPoints[0];
	const second = filteredPoints[1];
	const last = filteredPoints[filteredPoints.length - 1];
	const beforeLast = filteredPoints[filteredPoints.length - 2];
	const pathLength = filteredPoints.reduce(
		(total, point, index) =>
			index === 0 ? total : total + pointDistance(filteredPoints[index - 1], point),
		0,
	);
	const markerSize = Math.min(
		tileSize * PIPEWARE_DIRECTION_MARKER_SIZE_UNITS,
		Math.max(3, pathLength / 5),
	);
	const startDirection = normalizePointVector(first, second);
	const endDirection = normalizePointVector(beforeLast, last);
	const markers = [];
	if (startDirection) {
		const openingDirection = {
			x: -startDirection.x,
			y: -startDirection.y,
		};
		const tip = {
			x: first.x + startDirection.x * markerSize * 0.7,
			y: first.y + startDirection.y * markerSize * 0.7,
		};
		markers.push({
			id: `${idPrefix}:direction:start`,
			path: createDirectionTrianglePath(tip, openingDirection, markerSize),
		});
	}
	if (endDirection) {
		const tip = {
			x: last.x - endDirection.x * markerSize * 0.7,
			y: last.y - endDirection.y * markerSize * 0.7,
		};
		markers.push({
			id: `${idPrefix}:direction:end`,
			path: createDirectionTrianglePath(tip, endDirection, markerSize),
		});
	}
	return markers;
}

function createPipewareParameterHandle(
	placement,
	geometry,
	tileSize,
	pad,
	options,
) {
	const rotationTurns = normalizePipewareRotation(placement.rotation) / 90;
	const normal = normalizeVector(options.normal);
	if (!normal) return null;
	const currentValue = Math.abs(
		Number(
			placement.params?.[options.paramKey] ?? placement.params?.widthUnits ?? 1,
		),
	);
	const handleOffsetUnits = options.offsetUnits ?? 0;
	const localPoint = {
		x: options.point.x + normal.x * handleOffsetUnits,
		y: options.point.y + normal.y * handleOffsetUnits,
	};
	const rotatedPoint = rotatePlacementBasePoint(
		localPoint,
		geometry.baseWidth,
		geometry.baseHeight,
		rotationTurns,
	);
	const center = localPointToPixels(rotatedPoint, placement, tileSize, pad);
	const rotatedNormal = normalizeVector(
		rotateLocalVectorCCWNTimes(
			normal,
			geometry.baseWidth,
			geometry.baseHeight,
			rotationTurns,
		),
	);
	const dragNormal = normalizeVector(options.dragNormal ?? normal);
	const rotatedDragNormal = normalizeVector(
		rotateLocalVectorCCWNTimes(
			dragNormal,
			geometry.baseWidth,
			geometry.baseHeight,
			rotationTurns,
		),
	);
	if (!rotatedNormal || !rotatedDragNormal) return null;
	const radius = Math.max(4.5, Math.min(7, tileSize * 0.095));
	const hitSize = Math.max(20, tileSize * 0.24);
	return {
		id: `${placement.id}:param:${options.paramKey}:${options.id}:${
			placement.anchor?.tx ?? 0
		}:${placement.anchor?.ty ?? 0}:${placement.rotation}:${currentValue}:${
			center.x
		}:${center.y}`,
		placementId: placement.id,
		paramKey: options.paramKey,
		paramSide: options.paramSide ?? "",
		cx: center.x,
		cy: center.y,
		r: radius,
		x: center.x - hitSize / 2,
		y: center.y - hitSize / 2,
		w: hitSize,
		h: hitSize,
		normalX: rotatedDragNormal.x,
		normalY: rotatedDragNormal.y,
	};
}

function updatePipewareParameterHandlePosition(handle, cx, cy, tileSize) {
	const hitSize = Math.max(20, tileSize * 0.24);
	const roundedX = Number(cx.toFixed(3));
	const roundedY = Number(cy.toFixed(3));
	return {
		...handle,
		id: `${handle.id}:layout:${roundedX}:${roundedY}`,
		cx,
		cy,
		x: cx - hitSize / 2,
		y: cy - hitSize / 2,
		w: hitSize,
		h: hitSize,
	};
}

function getPipewareHandleSeparationDirection(handle, blocker, index) {
	const tangent = normalizeVector({
		x: -(handle.normalY ?? 0),
		y: handle.normalX ?? 0,
	});
	if (!tangent) return { x: index % 2 === 0 ? 1 : -1, y: 0 };
	const dx = handle.cx - blocker.cx;
	const dy = handle.cy - blocker.cy;
	const tangentProjection = dx * tangent.x + dy * tangent.y;
	if (Math.abs(tangentProjection) > 0.001) {
		const sign = tangentProjection < 0 ? -1 : 1;
		return { x: tangent.x * sign, y: tangent.y * sign };
	}
	const stableSign =
		[...`${handle.id}:${blocker.id ?? index}`].reduce(
			(total, char) => total + char.charCodeAt(0),
			0,
		) %
			2 ===
		0
			? 1
			: -1;
	return { x: tangent.x * stableSign, y: tangent.y * stableSign };
}

function separatePipewareParameterHandlesFromResizeHandles(
	parameterHandles,
	resizeHandles,
	tileSize,
) {
	if (!parameterHandles.length || !resizeHandles.length) return parameterHandles;
	const minDistance = Math.max(
		18,
		tileSize * PIPEWARE_PARAMETER_HANDLE_MIN_GAP_UNITS,
	);
	const separated = [];
	for (const handle of parameterHandles) {
		let cx = handle.cx;
		let cy = handle.cy;
		const blockers = [...resizeHandles, ...separated];
		for (let pass = 0; pass < 2; pass++) {
			for (let index = 0; index < blockers.length; index++) {
				const blocker = blockers[index];
				const dx = cx - blocker.cx;
				const dy = cy - blocker.cy;
				const distance = Math.hypot(dx, dy);
				if (distance >= minDistance) continue;
				const direction = getPipewareHandleSeparationDirection(
					{ ...handle, cx, cy },
					blocker,
					index,
				);
				const push = minDistance - distance + tileSize * 0.04;
				cx += direction.x * push;
				cy += direction.y * push;
			}
		}
		separated.push(updatePipewareParameterHandlePosition(handle, cx, cy, tileSize));
	}
	return separated;
}

function createJunctionParameterHandle(placement, geometry, tileSize, pad, options) {
	const handle = createPipewareParameterHandle(
		placement,
		geometry,
		tileSize,
		pad,
		{
			...options,
			offsetUnits: 0.18,
		},
	);
	return handle;
}

function getOffsetBendHandleSample(layout) {
	const transition = layout.transitionSegments?.[0];
	if (transition) {
		return {
			point: pointAtPipewareSegment(transition, 0.5),
		};
	}
	const point = {
		x: (layout.firstCorner.x + layout.secondCorner.x) / 2,
		y: (layout.firstCorner.y + layout.secondCorner.y) / 2,
	};
	return {
		point,
	};
}

function createOffsetBendParameterHandles(placement, geometry, tileSize, pad) {
	const params = placement.params ?? {};
	const layout = getOffsetBendLayout(placement.type, params);
	const sample = getOffsetBendHandleSample(layout);
	const width = params.channelWidthUnits ?? params.widthUnits ?? 1;
	const offsetSign = (params.offsetUnits ?? 0) < 0 ? -1 : 1;
	const handles = [];
	const shiftHandle = createPipewareParameterHandle(
		placement,
		geometry,
		tileSize,
		pad,
		{
			id: "bend-shift",
			paramKey: "lengthUnitsBottom",
			point: sample.point,
			normal: { x: 0, y: 1 },
			dragNormal: { x: 0, y: 1 },
		},
	);
	if (shiftHandle) handles.push(shiftHandle);
	const riseHandle = createPipewareParameterHandle(
		placement,
		geometry,
		tileSize,
		pad,
		{
			id: "bend-rise",
			paramKey: "riseUnits",
			point: sample.point,
			normal: { x: offsetSign, y: 0 },
			dragNormal: { x: 0, y: 1 },
			offsetUnits: width / 2 + 0.34,
		},
	);
	if (riseHandle) handles.push(riseHandle);
	const widthHandle = createPipewareParameterHandle(
		placement,
		geometry,
		tileSize,
		pad,
		{
			id: "end-width",
			paramKey: "channelWidthUnits",
			point: layout.end,
			normal: { x: -offsetSign, y: 0 },
			dragNormal: { x: -offsetSign, y: 0 },
			offsetUnits: width / 2 + 0.2,
		},
	);
	if (widthHandle) handles.push(widthHandle);
	return handles;
}

function createPipewareParameterHandles(placement, tileSize, pad) {
	const type = placement?.type;
	if (type !== "T" && type !== "X" && type !== "S" && type !== "D") return [];
	const geometry = getPipewareFeatureBaseGeometry(type, placement.params ?? {});
	const handles = [];
	if (type === "T") {
		const params = placement.params ?? {};
		const widthX = params.widthUnitsX ?? params.widthUnits ?? 1;
		const widthY = params.widthUnitsY ?? params.widthUnits ?? 1;
		const left = params.lengthUnitsLeft ?? 0;
		const centerEndX = left + widthY;
		const widthXHandle = createJunctionParameterHandle(
			placement,
			geometry,
			tileSize,
			pad,
			{
				id: "t-crossbar-outer-edge",
				paramKey: "widthUnitsX",
				point: { x: geometry.baseWidth, y: widthX },
				normal: { x: 1, y: 0 },
				dragNormal: { x: 0, y: 1 },
			},
		);
		if (widthXHandle) handles.push(widthXHandle);
		const widthYLeftHandle = createJunctionParameterHandle(
			placement,
			geometry,
			tileSize,
			pad,
			{
				id: "t-stem-left-edge",
				paramKey: "widthUnitsY",
				paramSide: "left",
				point: { x: left, y: geometry.baseHeight },
				normal: { x: 0, y: 1 },
				dragNormal: { x: -1, y: 0 },
			},
		);
		if (widthYLeftHandle) handles.push(widthYLeftHandle);
		const widthYRightHandle = createJunctionParameterHandle(
			placement,
			geometry,
			tileSize,
			pad,
			{
				id: "t-stem-right-edge",
				paramKey: "widthUnitsY",
				paramSide: "right",
				point: { x: centerEndX, y: geometry.baseHeight },
				normal: { x: 0, y: 1 },
				dragNormal: { x: 1, y: 0 },
			},
		);
		if (widthYRightHandle) handles.push(widthYRightHandle);
		return handles;
	}
	if (type === "X") {
		const params = placement.params ?? {};
		const widthX = params.widthUnitsX ?? params.widthUnits ?? 1;
		const widthY = params.widthUnitsY ?? params.widthUnits ?? 1;
		const left = params.lengthUnitsLeft ?? 1;
		const top = params.lengthUnitsTop ?? 1;
		const centerEndX = left + widthY;
		const centerEndY = top + widthX;
		const widthXTopHandle = createJunctionParameterHandle(
			placement,
			geometry,
			tileSize,
			pad,
			{
				id: "x-horizontal-top-edge",
				paramKey: "widthUnitsX",
				paramSide: "top",
				point: {
					x: geometry.baseWidth,
					y: top,
				},
				normal: { x: 1, y: 0 },
				dragNormal: { x: 0, y: -1 },
			},
		);
		if (widthXTopHandle) handles.push(widthXTopHandle);
		const widthXBottomHandle = createJunctionParameterHandle(
			placement,
			geometry,
			tileSize,
			pad,
			{
				id: "x-horizontal-bottom-edge",
				paramKey: "widthUnitsX",
				paramSide: "bottom",
				point: {
					x: geometry.baseWidth,
					y: centerEndY,
				},
				normal: { x: 1, y: 0 },
				dragNormal: { x: 0, y: 1 },
			},
		);
		if (widthXBottomHandle) handles.push(widthXBottomHandle);
		const widthYLeftHandle = createJunctionParameterHandle(
			placement,
			geometry,
			tileSize,
			pad,
			{
				id: "x-vertical-left-edge",
				paramKey: "widthUnitsY",
				paramSide: "left",
				point: {
					x: left,
					y: geometry.baseHeight,
				},
				normal: { x: 0, y: 1 },
				dragNormal: { x: -1, y: 0 },
			},
		);
		if (widthYLeftHandle) handles.push(widthYLeftHandle);
		const widthYRightHandle = createJunctionParameterHandle(
			placement,
			geometry,
			tileSize,
			pad,
			{
				id: "x-vertical-right-edge",
				paramKey: "widthUnitsY",
				paramSide: "right",
				point: {
					x: centerEndX,
					y: geometry.baseHeight,
				},
				normal: { x: 0, y: 1 },
				dragNormal: { x: 1, y: 0 },
			},
		);
		if (widthYRightHandle) handles.push(widthYRightHandle);
		return handles;
	}
	return createOffsetBendParameterHandles(placement, geometry, tileSize, pad);
}

function createLDirectionMarkers(
	placement,
	startPoint,
	endPoint,
	baseWidth,
	baseHeight,
	rotationTurns,
	tileSize,
) {
	const startInward = normalizeVector(
		rotateLocalVectorCCWNTimes(
			{ x: 1, y: 0 },
			baseWidth,
			baseHeight,
			rotationTurns,
		),
	);
	const endOutward = normalizeVector(
		rotateLocalVectorCCWNTimes(
			{ x: 0, y: 1 },
			baseWidth,
			baseHeight,
			rotationTurns,
		),
	);
	const markerSize = tileSize * PIPEWARE_DIRECTION_MARKER_SIZE_UNITS;
	const inset = markerSize * 0.7;
	const markers = [];
	if (startInward) {
		const outward = { x: -startInward.x, y: -startInward.y };
		const tip = {
			x: startPoint.x + startInward.x * inset,
			y: startPoint.y + startInward.y * inset,
		};
		markers.push({
			id: `${placement.id}:corner:direction:start`,
			path: createDirectionTrianglePath(tip, outward, markerSize),
		});
	}
	if (endOutward) {
		const tip = {
			x: endPoint.x - endOutward.x * inset,
			y: endPoint.y - endOutward.y * inset,
		};
		markers.push({
			id: `${placement.id}:corner:direction:end`,
			path: createDirectionTrianglePath(tip, endOutward, markerSize),
		});
	}
	return markers;
}

function getPipewareEditorCuttableEdgeKeys(placement, tileSize) {
	return getPipewarePlacementCuttableEdgeKeys(placement, tileSize);
}

function createZeroRadiusInnerCornerOpeningCenterline(
	placement,
	edgeKey,
	line,
	tileSize,
	pad,
	physicalTileSize,
) {
	const parsed = parsePipewareEdgeKey(edgeKey);
	if (!parsed || parsed.side !== "R" || placement.type !== "L") return null;
	const params = placement.params ?? {};
	if ((params.addedRadiusUnits ?? 0) !== 0) return null;
	const geometry = getBasePipewareLGeometry(params);
	const rotationTurns = normalizePipewareRotation(placement.rotation) / 90;
	const boundsWidth =
		rotationTurns % 2 === 0 ? geometry.baseWidth : geometry.baseHeight;
	const boundsHeight =
		rotationTurns % 2 === 0 ? geometry.baseHeight : geometry.baseWidth;
	const basePoint = rotateLocalPointCCWNTimes(
		parsed.tx,
		parsed.ty,
		boundsWidth,
		boundsHeight,
		(4 - rotationTurns) % 4,
	);
	if (pointDistance(basePoint, geometry.center) > 0.001) return null;

	const centerLocal = rotateLocalPointCCWNTimes(
		geometry.center.x + Math.SQRT1_2 * PIPEWARE_EDITOR_OPENING_EDGE_INSET_UNITS,
		geometry.center.y - Math.SQRT1_2 * PIPEWARE_EDITOR_OPENING_EDGE_INSET_UNITS,
		geometry.baseWidth,
		geometry.baseHeight,
		rotationTurns,
	);
	const center = localPointToPixels(
		centerLocal,
		placement,
		tileSize,
		pad,
	);
	const tangent = rotateLocalVectorCCWNTimes(
		{ x: 1, y: 1 },
		geometry.baseWidth,
		geometry.baseHeight,
		rotationTurns,
	);
	return createLineCenterlineFromPixelCenter(
		center,
		tangent,
		getEditorOpeningHalfWidthUnits(physicalTileSize) * tileSize * 2,
	);
}

function createPipewareOpeningCenterline(
	placement,
	edgeKey,
	tileSize,
	pad,
	physicalTileSize,
) {
	const openingOptions = {
		tileSize: physicalTileSize,
		lineHalfLengthUnits: getEditorOpeningHalfWidthUnits(physicalTileSize),
		...(placement?.type === "S" || placement?.type === "D"
			? null
			: { edgeInsetUnits: PIPEWARE_EDITOR_OPENING_EDGE_INSET_UNITS }),
	};
	const line = getPipewareOpeningLineLocal(placement, edgeKey, openingOptions);
	if (line) {
		const zeroRadiusInnerCorner = createZeroRadiusInnerCornerOpeningCenterline(
			placement,
			edgeKey,
			line,
			tileSize,
			pad,
			physicalTileSize,
		);
		if (zeroRadiusInnerCorner) return zeroRadiusInnerCorner;
	}
	const points = getPipewareOpeningPathLocalPoints(
		placement,
		edgeKey,
		openingOptions,
	);
	if (points?.length >= 2) {
		return createPathCenterlineFromLocalPoints(placement, points, tileSize, pad);
	}
	if (!line) return null;
	return createLineCenterlineFromLocalPoints(
		placement,
		line.start,
		line.end,
		tileSize,
		pad,
	);
}

function getOpeningGeometryCenter(geometry) {
	return averagePoints(geometry?.points ?? []);
}

function findOpeningGeometryCenterPair(a, b) {
	const centerA = getOpeningGeometryCenter(a);
	const centerB = getOpeningGeometryCenter(b);
	if (!centerA || !centerB) return null;
	return {
		a: centerA,
		b: centerB,
		distance: pointDistance(centerA, centerB),
	};
}

function averagePoints(points) {
	if (!points.length) return null;
	const sum = points.reduce(
		(total, point) => ({
			x: total.x + point.x,
			y: total.y + point.y,
		}),
		{ x: 0, y: 0 },
	);
	return {
		x: sum.x / points.length,
		y: sum.y / points.length,
	};
}

function getOpeningGeometryDirection(geometry) {
	const points = geometry?.points ?? [];
	if (points.length < 2) return null;
	const first = points[0];
	const last = points[points.length - 1];
	const dx = last.x - first.x;
	const dy = last.y - first.y;
	const length = Math.hypot(dx, dy);
	if (length <= 0.0001) return null;
	return { x: dx / length, y: dy / length };
}

function isAxisAlignedOpeningDirection(direction) {
	return Math.min(Math.abs(direction.x), Math.abs(direction.y)) <= 0.04;
}

function getPreferredMergedOpeningDirection(entries, placement) {
	if (placement?.type !== "D") return null;
	for (const entry of entries) {
		const direction = getOpeningGeometryDirection(entry.geometry);
		if (direction && !isAxisAlignedOpeningDirection(direction)) {
			return direction;
		}
	}
	return null;
}

function createMergedOpeningGeometry(
	entries,
	tileSize,
	mergeThreshold,
	placement,
	physicalTileSize,
) {
	if (entries.length === 1) return entries[0].geometry;

	const mergePoints = [];
	for (let index = 0; index < entries.length; index++) {
		for (let nextIndex = index + 1; nextIndex < entries.length; nextIndex++) {
			const pair = findOpeningGeometryCenterPair(
				entries[index].geometry,
				entries[nextIndex].geometry,
			);
			if (!pair || pair.distance > mergeThreshold) continue;
			mergePoints.push(pair.a, pair.b);
		}
	}
	const mergePoint = averagePoints(mergePoints);
	if (!mergePoint) return entries[0].geometry;

	const directions = [];
	for (const entry of entries) {
		const endpoints = entry.geometry.points?.length
			? [
					entry.geometry.points[0],
					entry.geometry.points[entry.geometry.points.length - 1],
				]
			: [];
		if (endpoints.length < 2) continue;
		const far =
			pointDistance(endpoints[0], mergePoint) >
			pointDistance(endpoints[1], mergePoint)
				? endpoints[0]
				: endpoints[1];
		let direction = {
			x: far.x - mergePoint.x,
			y: far.y - mergePoint.y,
		};
		if (Math.hypot(direction.x, direction.y) <= 0.0001) {
			direction = {
				x: endpoints[1].x - endpoints[0].x,
				y: endpoints[1].y - endpoints[0].y,
			};
		}
		const length = Math.hypot(direction.x, direction.y);
		if (length <= 0.0001) continue;
		directions.push({ x: direction.x / length, y: direction.y / length });
	}

	if (!directions.length) return entries[0].geometry;
	const reference = directions[0];
	const mergedDirection = directions.reduce(
		(total, direction) => {
			const dot = direction.x * reference.x + direction.y * reference.y;
			const sign = dot < 0 ? -1 : 1;
			return {
				x: total.x + direction.x * sign,
				y: total.y + direction.y * sign,
			};
		},
		{ x: 0, y: 0 },
	);
	const mergedLength =
		getEditorOpeningHalfWidthUnits(physicalTileSize) * tileSize * 2;
	const preferredDirection = getPreferredMergedOpeningDirection(
		entries,
		placement,
	);
	return createLineCenterlineFromPixelCenter(
		mergePoint,
		preferredDirection ??
			(Math.hypot(mergedDirection.x, mergedDirection.y) <= 0.0001
				? reference
				: mergedDirection),
		mergedLength,
	);
}

function createPipewareOpeningGroups(
	placement,
	edgeKeys,
	tileSize,
	pad,
	physicalTileSize,
) {
	const entries = edgeKeys
		.map((edgeKey) => ({
			edgeKey,
			geometry: createPipewareOpeningCenterline(
				placement,
				edgeKey,
				tileSize,
				pad,
				physicalTileSize,
			),
		}))
		.filter((entry) => entry.geometry?.d);
	const parents = entries.map((_, index) => index);
	const findRoot = (index) => {
		let current = index;
		while (parents[current] !== current) {
			parents[current] = parents[parents[current]];
			current = parents[current];
		}
		return current;
	};
	const mergeRoots = (a, b) => {
		const rootA = findRoot(a);
		const rootB = findRoot(b);
		if (rootA !== rootB) parents[rootB] = rootA;
	};
	const mergeThreshold = tileSize * PIPEWARE_OPENING_MERGE_DISTANCE_UNITS;
	for (let index = 0; index < entries.length; index++) {
		for (let nextIndex = index + 1; nextIndex < entries.length; nextIndex++) {
			const pair = findOpeningGeometryCenterPair(
				entries[index].geometry,
				entries[nextIndex].geometry,
			);
			if (pair && pair.distance <= mergeThreshold) {
				mergeRoots(index, nextIndex);
			}
		}
	}

	const grouped = new Map();
	for (let index = 0; index < entries.length; index++) {
		const root = findRoot(index);
		if (!grouped.has(root)) grouped.set(root, []);
		grouped.get(root).push(entries[index]);
	}
	return [...grouped.values()].map((groupEntries) => {
		const edgeKeys = groupEntries.map((entry) => entry.edgeKey);
		const geometry = createMergedOpeningGeometry(
			groupEntries,
			tileSize,
			mergeThreshold,
			placement,
			physicalTileSize,
		);
		return {
			id: edgeKeys.join("|"),
			edgeKey: edgeKeys[0],
			edgeKeys,
			edgeKeysValue: edgeKeys.join("|"),
			geometry,
		};
	});
}

function createGenericPipewareBodyGeometry(placement, tileSize, pad) {
	const fallbackThickness = getChannelThickness(tileSize, placement.params);
	const portInset = tileSize * PIPEWARE_PORT_OPENING_INSET_UNITS;
	const rotationTurns = normalizePipewareRotation(placement.rotation) / 90;
	const geometry = getPipewareFeatureBaseGeometry(
		placement.type,
		placement.params ?? {},
	);
	const commands = [];
	const bodyShapes = [];
	const directionMarkers = [];
	for (const path of geometry.centerlinePaths) {
		const strokeWidth = getPathChannelThickness(tileSize, placement.params, path);
		let points = samplePipewarePathPoints(path.segments, 10).map((point) => {
			const rotated = rotatePlacementBasePoint(
				point,
				geometry.baseWidth,
				geometry.baseHeight,
				rotationTurns,
			);
			return localPointToPixels(rotated, placement, tileSize, pad);
		});
		if (points.length >= 2) {
			points = [
				movePointAlongPath(points, true, portInset),
				...points.slice(1, -1),
				movePointAlongPath(points, false, portInset),
			];
		}
		const command = pathPointsToSvgPath(points);
		if (command) {
			commands.push(command);
			bodyShapes.push({
				id: `${placement.id}:body:${path.id}`,
				path: command,
				strokeWidth,
			});
		}
		directionMarkers.push(
			...createDirectionMarkersFromPathPoints(
				points,
				tileSize,
				`${placement.id}:${path.id}`,
			),
		);
	}
	return {
		path: commands.join(" "),
		fill: "none",
		strokeWidth: Math.max(
			fallbackThickness,
			...bodyShapes.map((shape) => shape.strokeWidth),
		),
		lineCap: "butt",
		lineJoin: placement.type === "D" ? "miter" : "round",
		portClipShapes: [],
		directionMarkers,
		bodyShapes,
	};
}

function createPipewareBodyGeometry(placement, tileSize, pad) {
	const thickness = getChannelThickness(tileSize, placement.params);
	const portInset = tileSize * PIPEWARE_PORT_OPENING_INSET_UNITS;
	if (placement.type !== "I" && placement.type !== "L") {
		return createGenericPipewareBodyGeometry(placement, tileSize, pad);
	}
	if (placement.type === "L") {
		const rotationTurns = normalizePipewareRotation(placement.rotation) / 90;
		const params = placement.params ?? {};
		const lengthUnitsX = params.lengthUnitsX ?? 0;
		const lengthUnitsY = params.lengthUnitsY ?? 0;
		const geometry = getBasePipewareLGeometry(params);
		const { baseWidth, baseHeight, center, centerlineRadius } = geometry;
		const arcRadius = centerlineRadius * tileSize;
		const portInsetUnits = portInset / tileSize;
		const clipPadUnits = getPipewareChannelThicknessUnits(params) + 1;
		const portClipShapes = [];

		const startPortLocal =
			lengthUnitsX === 0
				? { x: lengthUnitsX, y: geometry.horizontalY }
				: { x: portInsetUnits, y: geometry.horizontalY };
		const arcStartLocal = { x: lengthUnitsX, y: geometry.horizontalY };
		const arcEndLocal = { x: geometry.verticalX, y: center.y };
		const endPortLocal =
			lengthUnitsY === 0
				? arcEndLocal
				: { x: geometry.verticalX, y: baseHeight - portInsetUnits };
		if (lengthUnitsX === 0) {
			const clip = createLocalRectPixelBounds(
				{
					x: -clipPadUnits,
					y: -clipPadUnits,
					w: clipPadUnits + portInsetUnits,
					h: baseHeight + clipPadUnits * 2,
				},
				placement,
				baseWidth,
				baseHeight,
				rotationTurns,
				tileSize,
				pad,
			);
			if (clip) portClipShapes.push({ id: "start-port", ...clip });
		}
		if (lengthUnitsY === 0) {
			const clip = createLocalRectPixelBounds(
				{
					x: -clipPadUnits,
					y: baseHeight - portInsetUnits,
					w: baseWidth + clipPadUnits * 2,
					h: clipPadUnits + portInsetUnits,
				},
				placement,
				baseWidth,
				baseHeight,
				rotationTurns,
				tileSize,
				pad,
			);
			if (clip) portClipShapes.push({ id: "end-port", ...clip });
		}

		const startPort = rotateLocalPointCCWNTimes(
			startPortLocal.x,
			startPortLocal.y,
			baseWidth,
			baseHeight,
			rotationTurns,
		);
		const arcStart = rotateLocalPointCCWNTimes(
			arcStartLocal.x,
			arcStartLocal.y,
			baseWidth,
			baseHeight,
			rotationTurns,
		);
		const arcEnd = rotateLocalPointCCWNTimes(
			arcEndLocal.x,
			arcEndLocal.y,
			baseWidth,
			baseHeight,
			rotationTurns,
		);
		const endPort = rotateLocalPointCCWNTimes(
			endPortLocal.x,
			endPortLocal.y,
			baseWidth,
			baseHeight,
			rotationTurns,
		);
		const startPortPx = localPointToPixels(startPort, placement, tileSize, pad);
		const arcStartPx = localPointToPixels(arcStart, placement, tileSize, pad);
		const arcEndPx = localPointToPixels(arcEnd, placement, tileSize, pad);
		const endPortPx = localPointToPixels(endPort, placement, tileSize, pad);
		const commands = [`M ${startPortPx.x} ${startPortPx.y}`];
		if (pointDistance(startPortPx, arcStartPx) > 0.01) {
			commands.push(`L ${arcStartPx.x} ${arcStartPx.y}`);
		}
		commands.push(
			`A ${arcRadius} ${arcRadius} 0 0 1 ${arcEndPx.x} ${arcEndPx.y}`,
		);
		if (pointDistance(arcEndPx, endPortPx) > 0.01) {
			commands.push(`L ${endPortPx.x} ${endPortPx.y}`);
		}
		return {
			path: commands.join(" "),
			fill: "none",
			strokeWidth: thickness,
			lineCap: "butt",
			lineJoin: "round",
			portClipShapes,
			directionMarkers: createLDirectionMarkers(
				placement,
				startPortPx,
				endPortPx,
				baseWidth,
				baseHeight,
				rotationTurns,
				tileSize,
			),
		};
	}

	const bounds = createPipewareBoundsRect(placement, tileSize, pad);
	const rotation = normalizePipewareRotation(placement.rotation);
	if (!bounds.w || !bounds.h) {
		return {
			path: "",
			fill: "none",
			strokeWidth: thickness,
			lineCap: "butt",
			lineJoin: "round",
			directionMarkers: [],
		};
	}

	if (rotation % 180 === 0) {
		const start = movePointToward(
			{ x: bounds.x, y: bounds.y + bounds.h / 2 },
			{ x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 },
			portInset,
		);
		const end = movePointToward(
			{ x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 },
			{ x: bounds.x, y: bounds.y + bounds.h / 2 },
			portInset,
		);
		const points = [start, end];
		return {
			path: pathPointsToSvgPath(points),
			fill: "none",
			strokeWidth: thickness,
			lineCap: "butt",
			lineJoin: "round",
			directionMarkers: createDirectionMarkersFromPathPoints(
				points,
				tileSize,
				`${placement.id}:straight`,
			),
		};
	}

	const start = movePointToward(
		{ x: bounds.x + bounds.w / 2, y: bounds.y },
		{ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h },
		portInset,
	);
	const end = movePointToward(
		{ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h },
		{ x: bounds.x + bounds.w / 2, y: bounds.y },
		portInset,
	);
	const points = [start, end];
	return {
		path: pathPointsToSvgPath(points),
		fill: "none",
		strokeWidth: thickness,
		lineCap: "butt",
		lineJoin: "round",
		directionMarkers: createDirectionMarkersFromPathPoints(
			points,
			tileSize,
			`${placement.id}:straight`,
		),
	};
}

function createPipewareParamSignature(params = {}) {
	return Object.entries(params)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => `${key}=${value}`)
		.join(";");
}

export function createPipewareEditor2D(context) {
	const { app, partController } = context;
	const { signals, constants } = app;
	const { resolvedTheme, isMobileLayout } = signals;
	const {
		width,
		height,
		tileSizeValue,
		pipewarePlacements,
		pipewareSelectedPlacementId,
		pipewareActiveFeatureType,
		pipewarePreviewPlacement,
	} = partController.signals;
	const { pad, tileSize } = constants.editor2D;
	const pipewareActions = partController.editorActions;

	const svgW = $(() => width.value * tileSize + pad * 2);
	const svgH = $(() => height.value * tileSize + pad * 2);
	const boardWidthPx = $(() => width.value * tileSize);
	const boardHeightPx = $(() => height.value * tileSize);
	const gridTiles = $(() => {
		const items = [];
		for (let ty = 0; ty < height.value; ty++) {
			for (let tx = 0; tx < width.value; tx++) {
				items.push({
					id: `${tx}-${ty}`,
					tx,
					ty,
					x: pad + tx * tileSize,
					y: pad + ty * tileSize,
				});
			}
		}
		return items;
	});
	const selectedPlacement = $(
		() => {
			const selectedPlacementId = pipewareSelectedPlacementId.value;
			const placements = pipewarePlacements.value;
			return (
				placements.find((placement) => placement.id === selectedPlacementId) ??
				null
			);
		},
	);
	const emptyTiles = gridTiles;
	const placementHitTargets = $(() =>
		pipewarePlacements.value.map((placement) => {
			const bodyGeometry = createPipewareBodyGeometry(placement, tileSize, pad);
			const paramSignature = createPipewareParamSignature(placement.params);
			return {
				id: `${placement.id}:${placement.anchor.tx}:${placement.anchor.ty}:${
					placement.rotation
				}:${paramSignature}`,
				placementId: placement.id,
				path: bodyGeometry.path,
				strokeWidth: bodyGeometry.strokeWidth + Math.min(8, tileSize * 0.12),
			};
		}),
	);
	const selectedResizeHandles = $(() => {
		if (!selectedPlacement.value) return [];
		const bounds = createPipewareBoundsRect(selectedPlacement.value, tileSize, pad);
		const handleSize = Math.max(12, tileSize * 0.18);
		const handleRadius = Math.max(5, Math.min(8, tileSize * 0.115));
		const withHandleDots = (handles) =>
			handles.map((handle) => ({
				...handle,
				cx: handle.x + handle.w / 2,
				cy: handle.y + handle.h / 2,
				r: handleRadius,
			}));
		if (selectedPlacement.value.type === "L") {
			return withHandleDots([
				{
					id: `${selectedPlacement.value.id}:resize:n:${bounds.x}:${bounds.y}:${bounds.w}:${bounds.h}`,
					placementId: selectedPlacement.value.id,
					handleSide: "N",
					x: bounds.x + handleSize,
					y: bounds.y - handleSize / 2,
					w: bounds.w - handleSize * 2,
					h: handleSize,
				},
				{
					id: `${selectedPlacement.value.id}:resize:e:${bounds.x}:${bounds.y}:${bounds.w}:${bounds.h}`,
					placementId: selectedPlacement.value.id,
					handleSide: "E",
					x: bounds.x + bounds.w - handleSize / 2,
					y: bounds.y + handleSize,
					w: handleSize,
					h: bounds.h - handleSize * 2,
				},
				{
					id: `${selectedPlacement.value.id}:resize:s:${bounds.x}:${bounds.y}:${bounds.w}:${bounds.h}`,
					placementId: selectedPlacement.value.id,
					handleSide: "S",
					x: bounds.x + handleSize,
					y: bounds.y + bounds.h - handleSize / 2,
					w: bounds.w - handleSize * 2,
					h: handleSize,
				},
				{
					id: `${selectedPlacement.value.id}:resize:w:${bounds.x}:${bounds.y}:${bounds.w}:${bounds.h}`,
					placementId: selectedPlacement.value.id,
					handleSide: "W",
					x: bounds.x - handleSize / 2,
					y: bounds.y + handleSize,
					w: handleSize,
					h: bounds.h - handleSize * 2,
				},
			]);
		}

		const rotation = normalizePipewareRotation(selectedPlacement.value.rotation);
		if (rotation % 180 === 0) {
			return withHandleDots([
				{
					id: `${selectedPlacement.value.id}:resize:n:${bounds.x}:${bounds.y}:${bounds.w}:${bounds.h}`,
					placementId: selectedPlacement.value.id,
					handleSide: "N",
					x: bounds.x + tileSize * 0.2,
					y: bounds.y - handleSize / 2,
					w: bounds.w - tileSize * 0.4,
					h: handleSize,
				},
				{
					id: `${selectedPlacement.value.id}:resize:w:${bounds.x}:${bounds.y}:${bounds.w}:${bounds.h}`,
					placementId: selectedPlacement.value.id,
					handleSide: "W",
					x: bounds.x - handleSize / 2,
					y: bounds.y + tileSize * 0.2,
					w: handleSize,
					h: bounds.h - tileSize * 0.4,
				},
				{
					id: `${selectedPlacement.value.id}:resize:e:${bounds.x}:${bounds.y}:${bounds.w}:${bounds.h}`,
					placementId: selectedPlacement.value.id,
					handleSide: "E",
					x: bounds.x + bounds.w - handleSize / 2,
					y: bounds.y + tileSize * 0.2,
					w: handleSize,
					h: bounds.h - tileSize * 0.4,
				},
				{
					id: `${selectedPlacement.value.id}:resize:s:${bounds.x}:${bounds.y}:${bounds.w}:${bounds.h}`,
					placementId: selectedPlacement.value.id,
					handleSide: "S",
					x: bounds.x + tileSize * 0.2,
					y: bounds.y + bounds.h - handleSize / 2,
					w: bounds.w - tileSize * 0.4,
					h: handleSize,
				},
			]);
		}
		return withHandleDots([
			{
				id: `${selectedPlacement.value.id}:resize:n:${bounds.x}:${bounds.y}:${bounds.w}:${bounds.h}`,
				placementId: selectedPlacement.value.id,
				handleSide: "N",
				x: bounds.x + tileSize * 0.2,
				y: bounds.y - handleSize / 2,
				w: bounds.w - tileSize * 0.4,
				h: handleSize,
			},
			{
				id: `${selectedPlacement.value.id}:resize:w:${bounds.x}:${bounds.y}:${bounds.w}:${bounds.h}`,
				placementId: selectedPlacement.value.id,
				handleSide: "W",
				x: bounds.x - handleSize / 2,
				y: bounds.y + tileSize * 0.2,
				w: handleSize,
				h: bounds.h - tileSize * 0.4,
			},
			{
				id: `${selectedPlacement.value.id}:resize:e:${bounds.x}:${bounds.y}:${bounds.w}:${bounds.h}`,
				placementId: selectedPlacement.value.id,
				handleSide: "E",
				x: bounds.x + bounds.w - handleSize / 2,
				y: bounds.y + tileSize * 0.2,
				w: handleSize,
				h: bounds.h - tileSize * 0.4,
			},
			{
				id: `${selectedPlacement.value.id}:resize:s:${bounds.x}:${bounds.y}:${bounds.w}:${bounds.h}`,
				placementId: selectedPlacement.value.id,
				handleSide: "S",
				x: bounds.x + tileSize * 0.2,
				y: bounds.y + bounds.h - handleSize / 2,
				w: bounds.w - tileSize * 0.4,
				h: handleSize,
			},
		]);
	});
	const selectedParameterHandles = $(() => {
		const placement = selectedPlacement.value;
		if (!placement) return [];
		return separatePipewareParameterHandlesFromResizeHandles(
			createPipewareParameterHandles(placement, tileSize, pad),
			selectedResizeHandles.value,
			tileSize,
		);
	});
	const placements = $(() => {
		const backgroundIsDark = resolvedTheme.value === "dark";
		const themeKey = backgroundIsDark ? "dark" : "light";
		const previewPlacement = pipewarePreviewPlacement.value;
		const selectedPlacementId = pipewareSelectedPlacementId.value;
		const physicalTileSize = tileSizeValue.value;
		const items = pipewarePlacements.value.map((placement) => {
			const selected = placement.id === selectedPlacementId;
			const notchDepth = tileSize * PIPEWARE_OPENING_MASK_STROKE_UNITS;
			const bodyGeometry = createPipewareBodyGeometry(placement, tileSize, pad);
			const bounds = createPipewareBoundsRect(placement, tileSize, pad);
			const paramSignature = createPipewareParamSignature(placement.params);
			const renderKey = `${placement.id}:${placement.anchor.tx}:${placement.anchor.ty}:${placement.rotation}:${
				paramSignature
			}:${(placement.edgeCuts ?? []).join(",")}:${themeKey}:${
				selected ? "selected" : "idle"
			}`;
			const activeEdgeCuts = new Set(placement.edgeCuts ?? []);
			const openingGroups = createPipewareOpeningGroups(
				placement,
				getPipewareEditorCuttableEdgeKeys(placement, physicalTileSize),
				tileSize,
				pad,
				physicalTileSize,
			);
			const notchShapes = [
				...openingGroups
					.filter((group) =>
						group.edgeKeys.some((edgeKey) => activeEdgeCuts.has(edgeKey)),
					)
					.map((group) => ({
						id: `${renderKey}:notch:${group.id}`,
						path: group.geometry.d,
						strokeWidth: notchDepth,
						lineCap: "round",
					})),
			];
			const portClipShapes = bodyGeometry.portClipShapes ?? [];
			return {
				id: placement.id,
				renderKey,
				maskId: `uw-mask-${placement.id}-${placement.anchor.tx}-${placement.anchor.ty}-${placement.rotation}-${paramSignature.replaceAll(";", "-")}`,
				selected,
				bounds,
				maskBounds: {
					x: bounds.x - bodyGeometry.strokeWidth,
					y: bounds.y - bodyGeometry.strokeWidth,
					w: bounds.w + bodyGeometry.strokeWidth * 2,
					h: bounds.h + bodyGeometry.strokeWidth * 2,
				},
				bodyPath: bodyGeometry.path,
				bodyShapes: bodyGeometry.bodyShapes ?? [
					{
						id: `${renderKey}:body`,
						path: bodyGeometry.path,
						strokeWidth: bodyGeometry.strokeWidth,
					},
				],
				fill: bodyGeometry.fill,
				lineCap: bodyGeometry.lineCap,
				lineJoin: bodyGeometry.lineJoin,
				bodyStrokeWidth: bodyGeometry.strokeWidth,
				directionMarkers: bodyGeometry.directionMarkers ?? [],
				directionMarkerFill: backgroundIsDark ? "#e0f2fe" : "#0f172a",
				directionMarkerOpacity: selected ? 0.36 : 0.26,
				stroke: backgroundIsDark
					? selected
						? "#38bdf8"
						: "#2563eb"
					: selected
						? "#1d4ed8"
						: "#3b82f6",
				hasMask: notchShapes.length > 0 || portClipShapes.length > 0,
				notchShapes,
				portClipShapes,
			};
		});
		if (previewPlacement) {
			const bodyGeometry = createPipewareBodyGeometry(
				previewPlacement,
				tileSize,
				pad,
			);
			const bounds = createPipewareBoundsRect(previewPlacement, tileSize, pad);
			const paramSignature = createPipewareParamSignature(
				previewPlacement.params,
			);
			const renderKey = `preview:${previewPlacement.anchor.tx}:${previewPlacement.anchor.ty}:${previewPlacement.rotation}:${
				paramSignature
			}:${themeKey}`;
			const portClipShapes = bodyGeometry.portClipShapes ?? [];
			items.push({
				id: "__pipeware-placement-preview",
				renderKey,
				maskId: `uw-preview-mask-${renderKey.replaceAll(":", "-")}`,
				selected: false,
				bounds,
				maskBounds: {
					x: bounds.x - bodyGeometry.strokeWidth,
					y: bounds.y - bodyGeometry.strokeWidth,
					w: bounds.w + bodyGeometry.strokeWidth * 2,
					h: bounds.h + bodyGeometry.strokeWidth * 2,
				},
				bodyPath: bodyGeometry.path,
				bodyShapes: bodyGeometry.bodyShapes ?? [
					{
						id: `${renderKey}:body`,
						path: bodyGeometry.path,
						strokeWidth: bodyGeometry.strokeWidth,
					},
				],
				fill: bodyGeometry.fill,
				lineCap: bodyGeometry.lineCap,
				lineJoin: bodyGeometry.lineJoin,
				bodyStrokeWidth: bodyGeometry.strokeWidth,
				directionMarkers: bodyGeometry.directionMarkers ?? [],
				directionMarkerFill: backgroundIsDark ? "#e0f2fe" : "#0f172a",
				directionMarkerOpacity: 0.18,
				stroke: backgroundIsDark ? "#38bdf8" : "#1d4ed8",
				groupOpacity: 0.34,
				hasMask: portClipShapes.length > 0,
				notchShapes: [],
				portClipShapes,
			});
		}
		return items;
	});
	const selectedEdgeTargets = $(() => {
		if (!selectedPlacement.value) return [];
		const activeEdgeCuts = new Set(selectedPlacement.value.edgeCuts ?? []);
		const physicalTileSize = tileSizeValue.value;
		const groups = createPipewareOpeningGroups(
			selectedPlacement.value,
			getPipewareEditorCuttableEdgeKeys(
				selectedPlacement.value,
				physicalTileSize,
			),
			tileSize,
			pad,
			physicalTileSize,
		);
		return groups
			.map((group) => {
				const geometry = group.geometry;
				const worldEdgeKey = mapPipewareEdgeKeyToWorld(
					selectedPlacement.value,
					group.edgeKey,
				);
				if (!geometry?.bbox) return null;
				const active = group.edgeKeys.some((edgeKey) =>
					activeEdgeCuts.has(edgeKey),
				);
				return {
					id: `${selectedPlacement.value.id}:${group.id}:${worldEdgeKey}:${geometry.d}:${
						active ? "active" : "inactive"
					}`,
					placementId: selectedPlacement.value.id,
					edgeKey: group.edgeKey,
					edgeKeys: group.edgeKeysValue,
					active,
					path: geometry.d,
					hit: {
						x: geometry.bbox.x,
						y: geometry.bbox.y,
						w: geometry.bbox.w,
						h: geometry.bbox.h,
					},
				};
			})
			.filter(Boolean);
	});
	const editor2DResizeButtonFill = $(() =>
		resolvedTheme.value === "dark" ? "#0f172a" : "#ffffff",
	);
	const editor2DResizeButtonStroke = $(() =>
		resolvedTheme.value === "dark" ? "#334155" : "#cbd5e1",
	);
	const editor2DResizeButtonText = $(() =>
		resolvedTheme.value === "dark" ? "#e2e8f0" : "#334155",
	);
	const editor2DControlInset = pad / 2 - 6;
	const editor2DTopControlY = editor2DControlInset;
	const editor2DLeftControlX = editor2DControlInset;
	const editor2DRightControlX = $(() => svgW.value - editor2DControlInset);
	const editor2DBottomControlY = $(() => svgH.value - editor2DControlInset);
	const editor2DCenterX = $(() => svgW.value / 2);
	const editor2DCenterY = $(() => svgH.value / 2);
	const editor2DTopAddX = $(
		() => editor2DCenterX.value - EDITOR_2D_RESIZE_BUTTON_OFFSET,
	);
	const editor2DTopRemoveX = $(
		() => editor2DCenterX.value + EDITOR_2D_RESIZE_BUTTON_OFFSET,
	);
	const editor2DBottomAddX = $(
		() => editor2DCenterX.value - EDITOR_2D_RESIZE_BUTTON_OFFSET,
	);
	const editor2DBottomRemoveX = $(
		() => editor2DCenterX.value + EDITOR_2D_RESIZE_BUTTON_OFFSET,
	);
	const editor2DLeftAddY = $(
		() => editor2DCenterY.value - EDITOR_2D_RESIZE_BUTTON_OFFSET,
	);
	const editor2DLeftRemoveY = $(
		() => editor2DCenterY.value + EDITOR_2D_RESIZE_BUTTON_OFFSET,
	);
	const editor2DRightAddY = $(
		() => editor2DCenterY.value - EDITOR_2D_RESIZE_BUTTON_OFFSET,
	);
	const editor2DRightRemoveY = $(
		() => editor2DCenterY.value + EDITOR_2D_RESIZE_BUTTON_OFFSET,
	);

	return Object.freeze({
		renderers: PIPEWARE_EDITOR_2D_RENDERERS,
		scene: Object.freeze({
			pad,
			tileSize,
			svgW,
			svgH,
			boardWidthPx,
			boardHeightPx,
			gridTiles,
			emptyTiles,
			placementHitTargets,
			placements,
			selectedEdgeTargets,
			selectedResizeHandles,
			selectedParameterHandles,
			hasSelection: $(() => !!selectedPlacement.value),
			notchRadius: tileSize * 0.08,
			boardSurfaceFill: $(() =>
				resolvedTheme.value === "dark" ? "#020617" : "#eef2ff",
			),
			gridStroke: $(() =>
				resolvedTheme.value === "dark" ? "#1e293b" : "#cbd5e1",
			),
			backgroundCutFill: $(() =>
				resolvedTheme.value === "dark" ? "#020617" : "#ffffff",
			),
			selectionStroke: $(() =>
				resolvedTheme.value === "dark" ? "#f8fafc" : "#1e293b",
			),
			selectionStrokeOpacity: $(() =>
				resolvedTheme.value === "dark" ? 0.42 : 0.34,
			),
			activeOpeningFill: $(() =>
				resolvedTheme.value === "dark"
					? "rgba(248, 250, 252, 0.56)"
					: "rgba(15, 23, 42, 0.52)",
			),
			inactiveOpeningFill: $(() =>
				resolvedTheme.value === "dark"
					? "rgba(226, 232, 240, 0.68)"
					: "rgba(51, 65, 85, 0.62)",
			),
			openingTargetStrokeWidth: 4,
			resizeHandleFill: $(() => "#2563eb"),
			resizeHandleStroke: $(() => "#ffffff"),
			resizeHandleStrokeWidth: 2.5,
		}),
		sharedControls: Object.freeze({
			resize: Object.freeze({
				theme: Object.freeze({
					fill: editor2DResizeButtonFill,
					stroke: editor2DResizeButtonStroke,
					glyph: editor2DResizeButtonText,
				}),
				controls: Object.freeze([
					{
						id: "top-add",
						label: "+",
						action: "top-add",
						cx: editor2DTopAddX,
						cy: editor2DTopControlY,
					},
					{
						id: "top-remove",
						label: "-",
						action: "top-remove",
						cx: editor2DTopRemoveX,
						cy: editor2DTopControlY,
					},
					{
						id: "left-add",
						label: "+",
						action: "left-add",
						cx: editor2DLeftControlX,
						cy: editor2DLeftAddY,
					},
					{
						id: "left-remove",
						label: "-",
						action: "left-remove",
						cx: editor2DLeftControlX,
						cy: editor2DLeftRemoveY,
					},
					{
						id: "right-add",
						label: "+",
						action: "right-add",
						cx: editor2DRightControlX,
						cy: editor2DRightAddY,
					},
					{
						id: "right-remove",
						label: "-",
						action: "right-remove",
						cx: editor2DRightControlX,
						cy: editor2DRightRemoveY,
					},
					{
						id: "bottom-add",
						label: "+",
						action: "bottom-add",
						cx: editor2DBottomAddX,
						cy: editor2DBottomControlY,
					},
					{
						id: "bottom-remove",
						label: "-",
						action: "bottom-remove",
						cx: editor2DBottomRemoveX,
						cy: editor2DBottomControlY,
					},
				]),
			}),
		}),
		viewport: Object.freeze({
			hintText: $(() => createPipewareOpeningHint(pipewareActiveFeatureType.value)),
			hintClass: $(() =>
				isMobileLayout.value
					? "pointer-events-none absolute left-1/2 top-4 z-10 w-[min(calc(100%-2rem),340px)] -translate-x-1/2 rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-center text-[11px] font-medium text-slate-500 backdrop-blur dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-400"
					: "pointer-events-none absolute right-4 bottom-4 z-10 rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-[11px] font-medium text-slate-500 backdrop-blur dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-400",
			),
		}),
		actions: Object.freeze({
			readAction: pipewareActions.readAction,
			performAction: pipewareActions.performAction,
		}),
	});
}
