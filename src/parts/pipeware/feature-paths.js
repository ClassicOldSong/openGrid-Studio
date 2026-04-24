const PIPEWARE_SIDE_SAMPLE_STEP_UNITS = 1;
const PIPEWARE_CURVE_SAMPLE_RESOLUTION = 24;
const PIPEWARE_EDGE_SAMPLE_EXPOSURE_OFFSET = 0.08;
const PIPEWARE_EPSILON = 0.0001;
function lineSegment(start, end) {
	return { kind: "line", start, end };
}

function arcSegment(center, radius, startAngle, endAngle) {
	return { kind: "arc", center, radius, startAngle, endAngle };
}

function cubicSegment(start, control1, control2, end) {
	return { kind: "cubic", start, control1, control2, end };
}

function pointAtLine(segment, t) {
	return {
		x: segment.start.x + (segment.end.x - segment.start.x) * t,
		y: segment.start.y + (segment.end.y - segment.start.y) * t,
	};
}

function tangentAtLine(segment) {
	return normalizeVector({
		x: segment.end.x - segment.start.x,
		y: segment.end.y - segment.start.y,
	});
}

function pointAtArc(segment, t) {
	const angle =
		segment.startAngle + (segment.endAngle - segment.startAngle) * t;
	return {
		x: segment.center.x + Math.cos(angle) * segment.radius,
		y: segment.center.y + Math.sin(angle) * segment.radius,
	};
}

function tangentAtArc(segment, t) {
	const angle =
		segment.startAngle + (segment.endAngle - segment.startAngle) * t;
	const direction = segment.endAngle >= segment.startAngle ? 1 : -1;
	return normalizeVector({
		x: -Math.sin(angle) * direction,
		y: Math.cos(angle) * direction,
	});
}

export function pointAtCubic(segment, t) {
	const mt = 1 - t;
	return {
		x:
			mt * mt * mt * segment.start.x +
			3 * mt * mt * t * segment.control1.x +
			3 * mt * t * t * segment.control2.x +
			t * t * t * segment.end.x,
		y:
			mt * mt * mt * segment.start.y +
			3 * mt * mt * t * segment.control1.y +
			3 * mt * t * t * segment.control2.y +
			t * t * t * segment.end.y,
	};
}

export function tangentAtCubic(segment, t) {
	const mt = 1 - t;
	return normalizeVector({
		x:
			3 * mt * mt * (segment.control1.x - segment.start.x) +
			6 * mt * t * (segment.control2.x - segment.control1.x) +
			3 * t * t * (segment.end.x - segment.control2.x),
		y:
			3 * mt * mt * (segment.control1.y - segment.start.y) +
			6 * mt * t * (segment.control2.y - segment.control1.y) +
			3 * t * t * (segment.end.y - segment.control2.y),
	});
}

function normalizeVector(vector) {
	const length = Math.hypot(vector.x, vector.y);
	if (length <= PIPEWARE_EPSILON) return { x: 1, y: 0 };
	return { x: vector.x / length, y: vector.y / length };
}

function leftNormalFromTangent(tangent) {
	return { x: -tangent.y, y: tangent.x };
}

export function segmentLength(segment) {
	if (segment.kind === "line") {
		return Math.hypot(
			segment.end.x - segment.start.x,
			segment.end.y - segment.start.y,
		);
	}
	if (segment.kind === "arc") {
		return Math.abs(segment.endAngle - segment.startAngle) * segment.radius;
	}
	let length = 0;
	let previous = segment.start;
	for (let index = 1; index <= PIPEWARE_CURVE_SAMPLE_RESOLUTION; index++) {
		const next = pointAtCubic(segment, index / PIPEWARE_CURVE_SAMPLE_RESOLUTION);
		length += Math.hypot(next.x - previous.x, next.y - previous.y);
		previous = next;
	}
	return length;
}

export function pointAtPipewareSegment(segment, t) {
	if (segment.kind === "arc") return pointAtArc(segment, t);
	if (segment.kind === "cubic") return pointAtCubic(segment, t);
	return pointAtLine(segment, t);
}

export function tangentAtPipewareSegment(segment, t) {
	if (segment.kind === "arc") return tangentAtArc(segment, t);
	if (segment.kind === "cubic") return tangentAtCubic(segment, t);
	return tangentAtLine(segment);
}

export function samplePipewarePathPoints(segments, samplesPerUnit = 10) {
	const points = [];
	for (const segment of segments) {
		const steps = Math.max(1, Math.ceil(segmentLength(segment) * samplesPerUnit));
		for (let index = 0; index <= steps; index++) {
			if (points.length && index === 0) continue;
			points.push(pointAtPipewareSegment(segment, index / steps));
		}
	}
	return points;
}

export function getBasePipewareLGeometry(params) {
	const widthUnits = params.widthUnits ?? 1;
	const turnSpan = params.addedRadiusUnits + 1;
	const baseWidth = params.lengthUnitsX + turnSpan + widthUnits - 1;
	const baseHeight = params.lengthUnitsY + turnSpan + widthUnits - 1;
	const center = {
		x: params.lengthUnitsX,
		y: turnSpan + widthUnits - 1,
	};
	return {
		widthUnits,
		turnSpan,
		baseWidth,
		baseHeight,
		horizontalY: widthUnits / 2,
		verticalX: baseWidth - widthUnits / 2,
		center,
		centerlineRadius: Math.max(0.5, turnSpan + widthUnits / 2 - 1),
	};
}

function getStraightGeometry(type, params) {
	const widthUnits = params.widthUnits ?? 1;
	return {
		type,
		params,
		widthUnits,
		baseWidth: params.lengthUnits,
		baseHeight: widthUnits,
		centerlinePaths: [
			{
				id: "straight",
				segments: [
					lineSegment(
						{ x: 0, y: widthUnits / 2 },
						{ x: params.lengthUnits, y: widthUnits / 2 },
					),
				],
			},
		],
	};
}

function getCornerGeometry(type, params) {
	const geometry = getBasePipewareLGeometry(params);
	const segments = [];
	if (params.lengthUnitsX > 0) {
		segments.push(
			lineSegment(
				{ x: 0, y: geometry.horizontalY },
				{ x: params.lengthUnitsX, y: geometry.horizontalY },
			),
		);
	}
	segments.push(
		arcSegment(
			geometry.center,
			geometry.centerlineRadius,
			-Math.PI / 2,
			0,
		),
	);
	if (params.lengthUnitsY > 0) {
		segments.push(
			lineSegment(
				{ x: geometry.verticalX, y: geometry.center.y },
				{ x: geometry.verticalX, y: geometry.baseHeight },
			),
		);
	}
	return {
		type,
		params,
		widthUnits: geometry.widthUnits,
		baseWidth: geometry.baseWidth,
		baseHeight: geometry.baseHeight,
		centerlinePaths: [{ id: "corner", segments }],
	};
}

function getTJunctionGeometry(type, params) {
	const legacyWidthUnits = params.widthUnits ?? 1;
	const widthUnitsX = params.widthUnitsX ?? legacyWidthUnits;
	const widthUnitsY = params.widthUnitsY ?? legacyWidthUnits;
	const baseWidth =
		params.lengthUnitsLeft + params.lengthUnitsRight + widthUnitsY;
	const baseHeight = params.lengthUnitsY + widthUnitsX;
	const center = {
		x: params.lengthUnitsLeft + widthUnitsY / 2,
		y: widthUnitsX / 2,
	};
	return {
		type,
		params,
		widthUnits: Math.max(widthUnitsX, widthUnitsY),
		baseWidth,
		baseHeight,
		centerlinePaths: [
			{
				id: "t-crossbar",
				widthUnits: widthUnitsX,
				segments: [
					lineSegment({ x: 0, y: center.y }, { x: baseWidth, y: center.y }),
				],
			},
			{
				id: "t-stem",
				widthUnits: widthUnitsY,
				segments: [
					lineSegment(center, { x: center.x, y: baseHeight }),
				],
			},
		],
	};
}

function getCrossGeometry(type, params) {
	const legacyWidthUnits = params.widthUnits ?? 1;
	const widthUnitsX = params.widthUnitsX ?? legacyWidthUnits;
	const widthUnitsY = params.widthUnitsY ?? legacyWidthUnits;
	const baseWidth =
		params.lengthUnitsLeft + params.lengthUnitsRight + widthUnitsY;
	const baseHeight =
		params.lengthUnitsTop + params.lengthUnitsBottom + widthUnitsX;
	const center = {
		x: params.lengthUnitsLeft + widthUnitsY / 2,
		y: params.lengthUnitsTop + widthUnitsX / 2,
	};
	return {
		type,
		params,
		widthUnits: Math.max(widthUnitsX, widthUnitsY),
		baseWidth,
		baseHeight,
		centerlinePaths: [
			{
				id: "x-horizontal",
				widthUnits: widthUnitsX,
				segments: [
					lineSegment({ x: 0, y: center.y }, { x: baseWidth, y: center.y }),
				],
			},
			{
				id: "x-vertical",
				widthUnits: widthUnitsY,
				segments: [
					lineSegment({ x: center.x, y: 0 }, { x: center.x, y: baseHeight }),
				],
			},
		],
	};
}

function getSBendGeometry(type, params) {
	const layout = getOffsetBendLayout(type, params);
	return {
		type,
		params,
		widthUnits: layout.widthUnits,
		baseWidth: layout.baseWidth,
		baseHeight: layout.baseHeight,
		centerlinePaths: [
			{ id: "s-bend", widthUnits: layout.widthUnits, segments: layout.segments },
		],
	};
}

function distanceBetweenPoints(a, b) {
	return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointsDiffer(a, b) {
	return distanceBetweenPoints(a, b) > PIPEWARE_EPSILON;
}

export function getOffsetBendLayout(type, params) {
	const widthUnits = params.channelWidthUnits ?? params.widthUnits ?? 1;
	const offsetUnits = params.offsetUnits ?? 0;
	const minCenterX = Math.min(0, offsetUnits);
	const startX = widthUnits / 2 - minCenterX;
	const endX = startX + offsetUnits;
	const start = { x: startX, y: 0 };
	const diagonalStartY = params.lengthUnitsBottom;
	const diagonalEndY = params.lengthUnitsBottom + params.riseUnits;
	const endY = diagonalEndY + params.lengthUnitsTop;
	const baseWidth = Math.abs(offsetUnits) + widthUnits;
	const baseHeight = Math.max(widthUnits, endY);
	const firstCorner = { x: startX, y: diagonalStartY };
	const secondCorner = { x: endX, y: diagonalEndY };
	const end = { x: endX, y: endY };
	const diagonalLength = distanceBetweenPoints(firstCorner, secondCorner);
	if (
		Math.abs(offsetUnits) <= PIPEWARE_EPSILON ||
		diagonalLength <= PIPEWARE_EPSILON
	) {
		return {
			type,
			params,
			widthUnits,
			baseWidth,
			baseHeight,
			start,
			end,
			firstCorner: start,
			secondCorner: end,
			firstCurveStart: start,
			firstCurveEnd: start,
			secondCurveStart: end,
			secondCurveEnd: end,
			segments: [lineSegment(start, end)],
			transitionSegments: [],
			isStraight: true,
		};
	}

	const hasBottomRun = params.lengthUnitsBottom > 0;
	const hasTopRun = params.lengthUnitsTop > 0;
	const segments = [];
	const transitionSegments = [];
	let firstCurveStart = firstCorner;
	let firstCurveEnd = firstCorner;
	let secondCurveStart = secondCorner;
	let secondCurveEnd = secondCorner;
	if (type === "S") {
		const controlDistance = Math.min(
			1,
			Math.max(0.35, params.riseUnits * 0.5),
		);
		if (hasBottomRun && pointsDiffer(start, firstCorner)) {
			segments.push(lineSegment(start, firstCorner));
		}
		if (pointsDiffer(firstCorner, secondCorner)) {
			const transitionSegment = cubicSegment(
				firstCorner,
				{ x: firstCorner.x, y: firstCorner.y + controlDistance },
				{ x: secondCorner.x, y: secondCorner.y - controlDistance },
				secondCorner,
			);
			segments.push(transitionSegment);
			transitionSegments.push(transitionSegment);
		}
		if (hasTopRun && pointsDiffer(secondCorner, end)) {
			segments.push(lineSegment(secondCorner, end));
		}
	} else {
		if (hasBottomRun && pointsDiffer(start, firstCorner)) {
			segments.push(lineSegment(start, firstCorner));
		}
		if (pointsDiffer(firstCorner, secondCorner)) {
			const transitionSegment = lineSegment(firstCorner, secondCorner);
			segments.push(transitionSegment);
			transitionSegments.push(transitionSegment);
		}
		if (hasTopRun && pointsDiffer(secondCorner, end)) {
			segments.push(lineSegment(secondCorner, end));
		}
	}
	return {
		type,
		params,
		widthUnits,
		baseWidth,
		baseHeight,
		start,
		end,
		firstCorner,
		secondCorner,
		firstCurveStart,
		firstCurveEnd,
		secondCurveStart,
		secondCurveEnd,
		segments,
		transitionSegments,
		isStraight: false,
	};
}

function getDiagonalGeometry(type, params) {
	const layout = getOffsetBendLayout(type, params);
	return {
		type,
		params,
		widthUnits: layout.widthUnits,
		baseWidth: layout.baseWidth,
		baseHeight: layout.baseHeight,
		centerlinePaths: [
			{ id: "diagonal", widthUnits: layout.widthUnits, segments: layout.segments },
		],
	};
}

export function getPipewareFeatureBaseGeometry(type, params) {
	switch (type) {
		case "L":
			return getCornerGeometry(type, params);
		case "T":
			return getTJunctionGeometry(type, params);
		case "X":
			return getCrossGeometry(type, params);
		case "S":
			return getSBendGeometry(type, params);
		case "D":
			return getDiagonalGeometry(type, params);
		case "I":
		default:
			return getStraightGeometry("I", params);
	}
}

function angleBetween(angle, startAngle, endAngle) {
	if (startAngle <= endAngle) {
		return angle >= startAngle - PIPEWARE_EPSILON &&
			angle <= endAngle + PIPEWARE_EPSILON;
	}
	return angle <= startAngle + PIPEWARE_EPSILON &&
		angle >= endAngle - PIPEWARE_EPSILON;
}

function clamp01(value) {
	return Math.max(0, Math.min(1, value));
}

function distancePointToLineSegment(px, py, start, end) {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	if (Math.abs(dx) < PIPEWARE_EPSILON && Math.abs(dy) < PIPEWARE_EPSILON) {
		return Math.hypot(px - start.x, py - start.y);
	}
	const t = clamp01(
		((px - start.x) * dx + (py - start.y) * dy) / (dx * dx + dy * dy),
	);
	const nearestX = start.x + dx * t;
	const nearestY = start.y + dy * t;
	return Math.hypot(px - nearestX, py - nearestY);
}

function distancePointToSegment(px, py, segment) {
	if (segment.kind === "line") {
		return distancePointToLineSegment(px, py, segment.start, segment.end);
	}
	if (segment.kind === "arc") {
		const dx = px - segment.center.x;
		const dy = py - segment.center.y;
		let angle = Math.atan2(dy, dx);
		const minAngle = Math.min(segment.startAngle, segment.endAngle);
		const maxAngle = Math.max(segment.startAngle, segment.endAngle);
		if (angle < minAngle - Math.PI) angle += Math.PI * 2;
		if (angle > maxAngle + Math.PI) angle -= Math.PI * 2;
		if (angleBetween(angle, segment.startAngle, segment.endAngle)) {
			return Math.abs(Math.hypot(dx, dy) - segment.radius);
		}
		return Math.min(
			Math.hypot(px - pointAtArc(segment, 0).x, py - pointAtArc(segment, 0).y),
			Math.hypot(px - pointAtArc(segment, 1).x, py - pointAtArc(segment, 1).y),
		);
	}
	let distance = Infinity;
	let previous = segment.start;
	for (let index = 1; index <= PIPEWARE_CURVE_SAMPLE_RESOLUTION; index++) {
		const next = pointAtCubic(segment, index / PIPEWARE_CURVE_SAMPLE_RESOLUTION);
		distance = Math.min(
			distance,
			distancePointToLineSegment(px, py, previous, next),
		);
		previous = next;
	}
	return distance;
}

export function pointInsidePipewareBaseGeometryBand(geometry, x, y) {
	return geometry.centerlinePaths.some((path) =>
		path.segments.some((segment) => {
			const halfThickness = (path.widthUnits ?? geometry.widthUnits) / 2;
			return distancePointToSegment(x, y, segment) <= halfThickness;
		}),
	);
}

function pointOutsideBaseBounds(point, baseWidth, baseHeight, epsilon) {
	return (
		point.x < -epsilon ||
		point.y < -epsilon ||
		point.x > baseWidth + epsilon ||
		point.y > baseHeight + epsilon
	);
}

export function pipewareFeatureBodySticksOut(type, params, options = {}) {
	const geometry = getPipewareFeatureBaseGeometry(type, params);
	const samplesPerUnit = options.samplesPerUnit ?? 16;
	const epsilon = options.epsilon ?? PIPEWARE_EPSILON;
	for (const path of geometry.centerlinePaths ?? []) {
		const halfWidth = (path.widthUnits ?? geometry.widthUnits) / 2;
		for (const segment of path.segments ?? []) {
			const steps = Math.max(
				1,
				Math.ceil(segmentLength(segment) * samplesPerUnit),
			);
			for (let index = 0; index <= steps; index++) {
				const point = pointAtPipewareSegment(segment, index / steps);
				const tangent = tangentAtPipewareSegment(segment, index / steps);
				const normal = leftNormalFromTangent(tangent);
				if (
					pointOutsideBaseBounds(
						{
							x: point.x + normal.x * halfWidth,
							y: point.y + normal.y * halfWidth,
						},
						geometry.baseWidth,
						geometry.baseHeight,
						epsilon,
					) ||
					pointOutsideBaseBounds(
						{
							x: point.x - normal.x * halfWidth,
							y: point.y - normal.y * halfWidth,
						},
						geometry.baseWidth,
						geometry.baseHeight,
						epsilon,
					)
				) {
					return true;
				}
			}
		}
	}
	return false;
}

export function getPipewareBaseLineSegments(geometry) {
	return geometry.centerlinePaths.flatMap((path) =>
		path.segments.filter((segment) => segment.kind === "line"),
	);
}

function sampleSegmentSides(segment, widthUnits, pathSegments, segmentIndex) {
	const length = segmentLength(segment);
	const steps = Math.max(1, Math.ceil(length / PIPEWARE_SIDE_SAMPLE_STEP_UNITS));
	const halfWidth = widthUnits / 2;
	const samples = [];
	for (let index = 0; index <= steps; index++) {
		const t = index / steps;
		const point = pointAtPipewareSegment(segment, t);
		const tangent = tangentAtPipewareSegment(segment, t);
		const normal = leftNormalFromTangent(tangent);
		for (const side of ["L", "R"]) {
			const sign = side === "L" ? 1 : -1;
			const outsideNormal = {
				x: normal.x * sign,
				y: normal.y * sign,
			};
			samples.push({
				x: point.x + outsideNormal.x * halfWidth,
				y: point.y + outsideNormal.y * halfWidth,
				side,
				segment,
				segmentIndex,
				pathSegments,
				t,
				tangent,
				outsideNormal,
			});
		}
	}
	return samples;
}

export function getPipewareBaseSideSamples(geometry) {
	const seen = new Set();
	const samples = [];
	for (const path of geometry.centerlinePaths) {
		for (let segmentIndex = 0; segmentIndex < path.segments.length; segmentIndex++) {
			const segment = path.segments[segmentIndex];
			for (const sample of sampleSegmentSides(
				segment,
				path.widthUnits ?? geometry.widthUnits,
				path.segments,
				segmentIndex,
			)) {
				const probe = {
					x: sample.x +
						sample.outsideNormal.x * PIPEWARE_EDGE_SAMPLE_EXPOSURE_OFFSET,
					y: sample.y +
						sample.outsideNormal.y * PIPEWARE_EDGE_SAMPLE_EXPOSURE_OFFSET,
				};
				if (pointInsidePipewareBaseGeometryBand(geometry, probe.x, probe.y)) {
					continue;
				}
				const key = `${sample.side}:${sample.x.toFixed(4)}:${sample.y.toFixed(4)}`;
				if (seen.has(key)) continue;
				seen.add(key);
				samples.push(sample);
			}
		}
	}
	return samples;
}

export function findNearestPipewareBaseSideSample(geometry, point, side = null) {
	let best = null;
	for (const sample of getPipewareBaseSideSamples(geometry)) {
		if (side && sample.side !== side) continue;
		const dx = sample.x - point.x;
		const dy = sample.y - point.y;
		const distance = dx * dx + dy * dy;
		if (!best || distance < best.distance) {
			best = { ...sample, distance };
		}
	}
	return best;
}
