import {
	PIPEWARE_BASE_HEIGHT,
	PIPEWARE_BOOLEAN_OVERLAP,
	PIPEWARE_CHANNEL_WIDTH_SEPARATION,
	PIPEWARE_GRIP_TOP_CHAMFER,
	PIPEWARE_MIN_WALL,
	PIPEWARE_NUDGE,
	PIPEWARE_SNAP_CAPTURE_STRENGTH,
	PIPEWARE_SNAP_WALL_THICKNESS,
	PIPEWARE_TOP_CHAMFER,
} from "./physical-constants.js";

export function polygonArea(points) {
	let area = 0;
	for (let index = 0; index < points.length; index++) {
		const current = points[index];
		const next = points[(index + 1) % points.length];
		area += current[0] * next[1] - next[0] * current[1];
	}
	return area / 2;
}

function lineIntersection(a, b, c, d) {
	const abx = b[0] - a[0];
	const aby = b[1] - a[1];
	const cdx = d[0] - c[0];
	const cdy = d[1] - c[1];
	const denominator = abx * cdy - aby * cdx;
	if (Math.abs(denominator) <= 1e-8) return b;
	const acx = c[0] - a[0];
	const acy = c[1] - a[1];
	const t = (acx * cdy - acy * cdx) / denominator;
	return [a[0] + abx * t, a[1] + aby * t];
}

export function offsetPolygonInward(points, distance) {
	const area = polygonArea(points);
	const normalSign = area >= 0 ? 1 : -1;
	const lines = points.map((point, index) => {
		const next = points[(index + 1) % points.length];
		const dx = next[0] - point[0];
		const dy = next[1] - point[1];
		const length = Math.hypot(dx, dy) || 1;
		const nx = (-dy / length) * normalSign * distance;
		const ny = (dx / length) * normalSign * distance;
		return {
			start: [point[0] + nx, point[1] + ny],
			end: [next[0] + nx, next[1] + ny],
		};
	});
	return lines.map((line, index) => {
		const previous = lines[(index - 1 + lines.length) % lines.length];
		return lineIntersection(previous.start, previous.end, line.start, line.end);
	});
}

export function getPipewareChannelWidth(tileSize, widthUnits) {
	return (
		tileSize -
		PIPEWARE_CHANNEL_WIDTH_SEPARATION * 2 +
		(Math.max(1, widthUnits) - 1) * tileSize
	);
}

function createPipewareOuterPoints(widthMM, heightMM) {
	const topZ = PIPEWARE_TOP_CHAMFER + Math.max(0, heightMM);
	return [
		[-widthMM / 2, topZ],
		[-widthMM / 2, PIPEWARE_TOP_CHAMFER],
		[-widthMM / 2 + PIPEWARE_TOP_CHAMFER, 0],
		[-widthMM / 2 + PIPEWARE_TOP_CHAMFER + PIPEWARE_MIN_WALL, 0],
		[
			-widthMM / 2 +
				PIPEWARE_TOP_CHAMFER +
				PIPEWARE_MIN_WALL +
				PIPEWARE_NUDGE,
			0,
		],
		[
			widthMM / 2 -
				PIPEWARE_TOP_CHAMFER -
				PIPEWARE_MIN_WALL -
				PIPEWARE_NUDGE,
			0,
		],
		[widthMM / 2 - PIPEWARE_TOP_CHAMFER - PIPEWARE_MIN_WALL, 0],
		[widthMM / 2 - PIPEWARE_TOP_CHAMFER, 0],
		[widthMM / 2, PIPEWARE_TOP_CHAMFER],
		[widthMM / 2, topZ],
	];
}

export function createPipewareOuterProfile(widthMM, heightMM) {
	const outer = createPipewareOuterPoints(widthMM, heightMM);
	return polygonArea(outer) >= 0 ? outer : outer.reverse();
}

export function createPipewareInnerCutProfile(widthMM, heightMM) {
	const cutTopZ =
		PIPEWARE_TOP_CHAMFER +
		Math.max(0, heightMM) +
		PIPEWARE_BASE_HEIGHT +
		PIPEWARE_BOOLEAN_OVERLAP;
	const outer = createPipewareOuterPoints(widthMM, heightMM);
	const inner = offsetPolygonInward(outer, PIPEWARE_SNAP_WALL_THICKNESS);
	if (inner.length >= 2) {
		inner[0] = [inner[0][0], cutTopZ];
		inner[inner.length - 1] = [inner[inner.length - 1][0], cutTopZ];
	}
	const cleanInner =
		inner.length >= 10
			? [inner[0], inner[1], inner[2], inner[7], inner[8], inner[9]]
			: inner;
	return polygonArea(cleanInner) >= 0 ? cleanInner : cleanInner.reverse();
}

export function createPipewareProfile(widthMM, heightMM) {
	const outer = createPipewareOuterPoints(widthMM, heightMM);
	const inner = offsetPolygonInward(outer, PIPEWARE_SNAP_WALL_THICKNESS);
	const topZ = PIPEWARE_TOP_CHAMFER + Math.max(0, heightMM);
	if (inner.length >= 2) {
		inner[0] = [inner[0][0], topZ];
		inner[inner.length - 1] = [inner[inner.length - 1][0], topZ];
	}
	const profile = [...outer, ...inner.reverse()];
	return polygonArea(profile) >= 0 ? profile : profile.reverse();
}

export function createPipewareGripProfile(widthMM, side, heightMM) {
	const z0 = PIPEWARE_TOP_CHAMFER + Math.max(0, heightMM);
	const points = [
		[PIPEWARE_SNAP_CAPTURE_STRENGTH, -PIPEWARE_BOOLEAN_OVERLAP],
		[
			PIPEWARE_SNAP_CAPTURE_STRENGTH,
			PIPEWARE_BASE_HEIGHT - PIPEWARE_SNAP_WALL_THICKNESS,
		],
		[0, PIPEWARE_BASE_HEIGHT - PIPEWARE_SNAP_WALL_THICKNESS / 2],
		[0, PIPEWARE_BASE_HEIGHT - PIPEWARE_GRIP_TOP_CHAMFER],
		[PIPEWARE_SNAP_CAPTURE_STRENGTH, PIPEWARE_BASE_HEIGHT],
		[PIPEWARE_SNAP_WALL_THICKNESS, PIPEWARE_BASE_HEIGHT],
		[PIPEWARE_SNAP_WALL_THICKNESS, -PIPEWARE_BOOLEAN_OVERLAP],
	].map(([offset, z]) => [side * (widthMM / 2 - offset), z0 + z]);
	return polygonArea(points) >= 0 ? points : points.reverse();
}
