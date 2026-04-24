import { GLTFNode, GLTFNodesToGLTFDoc } from "manifold-3d/lib/scene-builder";
import { toArrayBuffer as export3mfToArrayBuffer } from "manifold-3d/lib/export-3mf";
import {
	getBasePipewareLGeometry,
	getPipewareOpeningLineLocal,
	getPipewarePlacementCuttableEdgeKeys,
	normalizePipewareFeatureParams,
	normalizePipewareFeatureType,
	normalizePipewarePlacement,
	normalizePipewareRotation,
	parsePipewareEdgeKey,
} from "./feature-library.js";
import {
	findNearestPipewareBaseSideSample,
	getOffsetBendLayout,
	getPipewareBaseLineSegments,
	getPipewareFeatureBaseGeometry,
	pointAtCubic,
	pointAtPipewareSegment,
	segmentLength,
	tangentAtCubic,
	tangentAtPipewareSegment,
} from "./feature-paths.js";
import {
	getManifoldApi,
	warmManifoldRuntime,
} from "../shared/geometry/manifold-runtime.js";
import {
	buildAsciiStlFromModels,
	buildBinaryStlFromModels,
	buildPreviewMeshFromModels,
} from "./geometry/exporters.js";
import { PIPEWARE_THICKNESS_MIN } from "./constants.js";
import {
	createPipewareGripProfile,
	createPipewareInnerCutProfile,
	createPipewareOuterProfile,
	getPipewareChannelWidth,
} from "./geometry/profiles.js";
import {
	buildSweepMesh,
	buildVariableProfileSweepMesh,
} from "./geometry/sweep.js";
import {
	clampPositive,
	clampPositiveInteger,
	getArcSegmentCount,
	getPipewareOpeningCutCenterInsetUnits,
	getPipewareOpeningCutHalfWidth,
	PIPEWARE_BASE_HEIGHT,
	PIPEWARE_BOOLEAN_OVERLAP,
	PIPEWARE_CORD_CUTOUT_CHAMFER,
	PIPEWARE_DEFAULT_CIRCLE_SEGMENTS,
	PIPEWARE_DEFAULT_HEIGHT,
	PIPEWARE_DEFAULT_TILE_SIZE,
	PIPEWARE_EPSILON,
	PIPEWARE_GRIP_SIZE,
	PIPEWARE_GRIP_SPACING_FROM_CHANNEL,
	PIPEWARE_MIN_ARC_SEGMENTS,
	PIPEWARE_NUDGE,
	PIPEWARE_OPENING_COVER_CLEARANCE,
	PIPEWARE_OPENING_CUT_DEPTH,
	PIPEWARE_SNAP_WALL_THICKNESS,
	PIPEWARE_TOP_CHAMFER,
} from "./geometry/physical-constants.js";

function emptyManifold(Manifold) {
	return Manifold.hull([]);
}

function unionAll(Manifold, items) {
	if (!items.length) return emptyManifold(Manifold);
	if (items.length === 1) return items[0];
	return Manifold.union(items);
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

function getPlacementBaseDimensions(placement) {
	const type = normalizePipewareFeatureType(placement.type);
	const params = normalizePipewareFeatureParams(type, placement.params);
	const geometry = getPipewareFeatureBaseGeometry(type, params);
	return {
		type,
		params,
		width: geometry.baseWidth,
		height: geometry.baseHeight,
		geometry,
	};
}

function rotateBasePoint(point, base, rotation) {
	return rotateLocalPointCCWNTimes(
		point.x,
		point.y,
		base.width,
		base.height,
		normalizePipewareRotation(rotation) / 90,
	);
}

function transformBasePointToWorld(point, placement, base, tileSize) {
	const rotated = rotateBasePoint(point, base, placement.rotation);
	return [
		((placement.anchor?.tx ?? 0) + rotated.x) * tileSize,
		((placement.anchor?.ty ?? 0) + rotated.y) * tileSize,
	];
}

function transformBaseVectorToWorld(point, vector, placement, base, tileSize) {
	const origin = rotateBasePoint(point, base, placement.rotation);
	const rotated = rotateLocalPointCCWNTimes(
		point.x + vector.x,
		point.y + vector.y,
		base.width,
		base.height,
		normalizePipewareRotation(placement.rotation) / 90,
	);
	const dx = (rotated.x - origin.x) * tileSize;
	const dy = (rotated.y - origin.y) * tileSize;
	const length = Math.hypot(dx, dy) || 1;
	return [dx / length, dy / length];
}

function transformLocalPointToWorld(point, placement, tileSize) {
	return [
		((placement.anchor?.tx ?? 0) + point.x) * tileSize,
		((placement.anchor?.ty ?? 0) + point.y) * tileSize,
	];
}

function transformLocalVectorToWorld(vector, tileSize) {
	const dx = vector.x * tileSize;
	const dy = vector.y * tileSize;
	const length = Math.hypot(dx, dy) || 1;
	return [dx / length, dy / length];
}

function createStraightStations(start, end, placement, base, tileSize) {
	const centerStart = transformBasePointToWorld(start, placement, base, tileSize);
	const centerEnd = transformBasePointToWorld(end, placement, base, tileSize);
	const tangent = transformBaseVectorToWorld(
		start,
		{ x: end.x - start.x, y: end.y - start.y },
		placement,
		base,
		tileSize,
	);
	return [
		{
			center: centerStart,
			normal: [-tangent[1], tangent[0]],
		},
		{
			center: centerEnd,
			normal: [-tangent[1], tangent[0]],
		},
	];
}

function createArcStations(
	center,
	radius,
	startAngle,
	endAngle,
	placement,
	base,
	tileSize,
	circleSegments,
) {
	const segments = getArcSegmentCount(startAngle, endAngle, circleSegments);
	const stations = [];
	for (let index = 0; index <= segments; index++) {
		const t = index / segments;
		const angle = startAngle + (endAngle - startAngle) * t;
		const point = {
			x: center.x + Math.cos(angle) * radius,
			y: center.y + Math.sin(angle) * radius,
		};
		const tangent = { x: -Math.sin(angle), y: Math.cos(angle) };
		const centerWorld = transformBasePointToWorld(point, placement, base, tileSize);
		const tangentWorld = transformBaseVectorToWorld(
			point,
			tangent,
			placement,
			base,
			tileSize,
		);
		stations.push({
			center: centerWorld,
			normal: [-tangentWorld[1], tangentWorld[0]],
		});
	}
	return stations;
}

function getCubicSegmentCount(segment, tileSize, circleSegments) {
	let length = 0;
	let previous = segment.start;
	const samples = 16;
	const segmentQuality = clampPositiveInteger(
		circleSegments,
		PIPEWARE_DEFAULT_CIRCLE_SEGMENTS,
	);
	for (let index = 1; index <= samples; index++) {
		const next = pointAtCubic(segment, index / samples);
		length += Math.hypot(next.x - previous.x, next.y - previous.y);
		previous = next;
	}
	return Math.max(
		PIPEWARE_MIN_ARC_SEGMENTS,
		Math.ceil(segmentQuality / 2),
		Math.ceil((length * segmentQuality) / 8),
	);
}

function createCubicStations(segment, placement, base, tileSize, circleSegments) {
	const segments = getCubicSegmentCount(segment, tileSize, circleSegments);
	const stations = [];
	for (let index = 0; index <= segments; index++) {
		const t = index / segments;
		const point = pointAtCubic(segment, t);
		const tangent = tangentAtCubic(segment, t);
		const centerWorld = transformBasePointToWorld(point, placement, base, tileSize);
		const tangentWorld = transformBaseVectorToWorld(
			point,
			tangent,
			placement,
			base,
			tileSize,
		);
		stations.push({
			center: centerWorld,
			normal: [-tangentWorld[1], tangentWorld[0]],
		});
	}
	return stations;
}

function createMiterNormal(previousNormal, nextNormal) {
	const normalX = previousNormal[0] + nextNormal[0];
	const normalY = previousNormal[1] + nextNormal[1];
	const normalLength = Math.hypot(normalX, normalY);
	if (normalLength <= PIPEWARE_EPSILON) return previousNormal;

	const unitX = normalX / normalLength;
	const unitY = normalY / normalLength;
	const scale =
		unitX * previousNormal[0] + unitY * previousNormal[1];
	if (Math.abs(scale) <= PIPEWARE_EPSILON) return previousNormal;

	// A miter station must be longer than a unit normal so each offset profile
	// point lands on both neighboring segment offset lines.
	return [unitX / scale, unitY / scale];
}

function appendStations(target, stations) {
	for (const station of stations) {
		const previous = target[target.length - 1];
		if (
			previous &&
			Math.hypot(
				previous.center[0] - station.center[0],
				previous.center[1] - station.center[1],
			) < PIPEWARE_EPSILON
		) {
			previous.normal = createMiterNormal(previous.normal, station.normal);
			continue;
		}
		target.push(station);
	}
}

function cloneStation(station) {
	return {
		...station,
		center: [...station.center],
		normal: [...station.normal],
	};
}

function getStationTangent(start, end) {
	const dx = end.center[0] - start.center[0];
	const dy = end.center[1] - start.center[1];
	const length = Math.hypot(dx, dy);
	if (length <= PIPEWARE_EPSILON) return [0, 1];
	return [dx / length, dy / length];
}

function moveStationAlong(station, tangent, distance) {
	return {
		...station,
		center: [
			station.center[0] + tangent[0] * distance,
			station.center[1] + tangent[1] * distance,
		],
	};
}

function extendStationsAlongPath(stations, distance) {
	if (stations.length < 2 || distance <= 0) return stations.map(cloneStation);
	const nextStations = stations.map(cloneStation);
	const firstTangent = getStationTangent(nextStations[0], nextStations[1]);
	const lastTangent = getStationTangent(
		nextStations[nextStations.length - 2],
		nextStations[nextStations.length - 1],
	);
	nextStations[0] = moveStationAlong(nextStations[0], firstTangent, -distance);
	nextStations[nextStations.length - 1] = moveStationAlong(
		nextStations[nextStations.length - 1],
		lastTangent,
		distance,
	);
	return nextStations;
}

function createSegmentStations(segment, placement, base, tileSize, circleSegments) {
	if (segment.kind === "line") {
		return createStraightStations(
			segment.start,
			segment.end,
			placement,
			base,
			tileSize,
		);
	}
	if (segment.kind === "arc") {
		return createArcStations(
			segment.center,
			segment.radius,
			segment.startAngle,
			segment.endAngle,
			placement,
			base,
			tileSize,
			circleSegments,
		);
	}
	if (segment.kind === "cubic") {
		return createCubicStations(
			segment,
			placement,
			base,
			tileSize,
			circleSegments,
		);
	}
	return [];
}

function getPlacementPathStationGroups(
	placement,
	base,
	tileSize,
	circleSegments,
) {
	return (base.geometry?.centerlinePaths ?? []).map((path) => {
		const stations = [];
		for (const segment of path.segments) {
			appendStations(
				stations,
				createSegmentStations(
					segment,
					placement,
					base,
					tileSize,
					circleSegments,
				),
			);
		}
		stations.widthUnits = path.widthUnits ?? base.geometry?.widthUnits;
		return stations;
	});
}

function getPlacementSegmentStationGroups(
	placement,
	base,
	tileSize,
	circleSegments,
) {
	return (base.geometry?.centerlinePaths ?? []).flatMap((path) =>
		path.segments
			.map((segment) => {
				const stations = createSegmentStations(
					segment,
					placement,
					base,
					tileSize,
					circleSegments,
				);
				stations.widthUnits = path.widthUnits ?? base.geometry?.widthUnits;
				return stations;
			})
			.filter((stations) => stations.length >= 2),
	);
}

function buildStraightGripStations(
	start,
	end,
	placement,
	base,
	tileSize,
) {
	// The SCAD hooks are rotated 180deg around Z relative to the channel path.
	return createStraightStations(end, start, placement, base, tileSize);
}

function buildGripEndCutModels(Manifold, stations, profile, height) {
	if (stations.length < 2) return [];
	const first = stations[0];
	const last = stations[stations.length - 1];
	const dx = last.center[0] - first.center[0];
	const dy = last.center[1] - first.center[1];
	const length = Math.hypot(dx, dy);
	if (length <= PIPEWARE_EPSILON) return [];
	const tangent = [dx / length, dy / length];
	const offsets = profile.map(([offset]) => offset);
	const minOffset = Math.min(...offsets) - PIPEWARE_NUDGE;
	const maxOffset = Math.max(...offsets) + PIPEWARE_NUDGE;
	const gripTopZ = getPipewareGripTopZ(height);
	const zTop = gripTopZ + PIPEWARE_NUDGE;
	const zLow = gripTopZ - PIPEWARE_SNAP_WALL_THICKNESS - PIPEWARE_NUDGE;
	const cutLength = PIPEWARE_SNAP_WALL_THICKNESS + PIPEWARE_NUDGE;
	const point = (station, u, offset, z) => [
		station.center[0] + tangent[0] * u + station.normal[0] * offset,
		station.center[1] + tangent[1] * u + station.normal[1] * offset,
		z,
	];
	const buildCut = (station, direction) => {
		const outside = -direction * PIPEWARE_NUDGE;
		const inside = direction * cutLength;
		const triangle = [
			[outside, zLow],
			[outside, zTop],
			[inside, zTop],
		];
		return Manifold.hull(
			triangle.flatMap(([u, z]) => [
				point(station, u, minOffset, z),
				point(station, u, maxOffset, z),
			]),
		);
	};
	return [buildCut(first, 1), buildCut(last, -1)];
}

function buildGripModel(
	Manifold,
	Mesh,
	triangulate,
	profile,
	stations,
	height,
) {
	const grip = buildSweepMesh(Manifold, Mesh, triangulate, profile, stations);
	if (!grip || grip.isEmpty()) return null;
	const cuts = buildGripEndCutModels(Manifold, stations, profile, height).filter(
		(cut) => !cut.isEmpty(),
	);
	if (!cuts.length) return grip;
	return grip.subtract(unionAll(Manifold, cuts));
}

function addStraightGripModels(
	models,
	Manifold,
	Mesh,
	triangulate,
	placement,
	base,
	tileSize,
	height,
) {
	const widthMM = getPipewareChannelWidth(tileSize, base.params.widthUnits);
	const lengthUnits =
		base.type === "I" ? base.params.lengthUnits : base.params.lengthUnitsX;
	const centerY = base.params.widthUnits / 2;
	if (lengthUnits * tileSize <= PIPEWARE_GRIP_SIZE) return;
	for (let index = 0; index < lengthUnits; index++) {
		const startX = index + PIPEWARE_GRIP_SPACING_FROM_CHANNEL / tileSize;
		const endX =
			index +
			(PIPEWARE_GRIP_SIZE + PIPEWARE_GRIP_SPACING_FROM_CHANNEL) / tileSize;
		for (const side of [-1, 1]) {
			const profile = createPipewareGripProfile(widthMM, side, height);
			const grip = buildGripModel(
				Manifold,
				Mesh,
				triangulate,
				profile,
				buildStraightGripStations(
					{ x: startX, y: centerY },
					{ x: endX, y: centerY },
					placement,
					base,
					tileSize,
				),
				height,
			);
			if (grip && !grip.isEmpty()) models.push(grip);
		}
	}
}

function addCornerGripModels(
	models,
	Manifold,
	Mesh,
	triangulate,
	placement,
	base,
	tileSize,
	height,
) {
	if (base.type !== "L") return;
	const widthMM = getPipewareChannelWidth(tileSize, base.params.widthUnits);
	const geometry = getBasePipewareLGeometry(base.params);
	if (base.params.lengthUnitsX * tileSize > PIPEWARE_GRIP_SIZE) {
		for (let index = 0; index < base.params.lengthUnitsX; index++) {
			const startX = index + PIPEWARE_GRIP_SPACING_FROM_CHANNEL / tileSize;
			const endX =
				index +
				(PIPEWARE_GRIP_SIZE + PIPEWARE_GRIP_SPACING_FROM_CHANNEL) / tileSize;
			for (const side of [-1, 1]) {
				const profile = createPipewareGripProfile(widthMM, side, height);
				const grip = buildGripModel(
					Manifold,
					Mesh,
					triangulate,
					profile,
					buildStraightGripStations(
						{ x: startX, y: geometry.horizontalY },
						{ x: endX, y: geometry.horizontalY },
						placement,
						base,
						tileSize,
					),
					height,
				);
				if (grip && !grip.isEmpty()) models.push(grip);
			}
		}
	}
	if (base.params.lengthUnitsY * tileSize <= PIPEWARE_GRIP_SIZE) return;
	for (let index = 0; index < base.params.lengthUnitsY; index++) {
		const startY =
			geometry.center.y +
			index +
			PIPEWARE_GRIP_SPACING_FROM_CHANNEL / tileSize;
		const endY =
			geometry.center.y +
			index +
			(PIPEWARE_GRIP_SIZE + PIPEWARE_GRIP_SPACING_FROM_CHANNEL) / tileSize;
		for (const side of [-1, 1]) {
			const profile = createPipewareGripProfile(widthMM, side, height);
			const grip = buildGripModel(
				Manifold,
				Mesh,
				triangulate,
				profile,
				buildStraightGripStations(
					{ x: geometry.verticalX, y: startY },
					{ x: geometry.verticalX, y: endY },
					placement,
					base,
					tileSize,
				),
				height,
			);
			if (grip && !grip.isEmpty()) models.push(grip);
		}
	}
}

function interpolateLinePoint(segment, distanceUnits) {
	const dx = segment.end.x - segment.start.x;
	const dy = segment.end.y - segment.start.y;
	const length = Math.hypot(dx, dy);
	if (length <= PIPEWARE_EPSILON) return { ...segment.start };
	const t = distanceUnits / length;
	return {
		x: segment.start.x + dx * t,
		y: segment.start.y + dy * t,
	};
}

function addLineSegmentGripModels(
	models,
	Manifold,
	Mesh,
	triangulate,
	placement,
	base,
	tileSize,
	height,
	segment,
) {
	const lengthUnits = Math.hypot(
		segment.end.x - segment.start.x,
		segment.end.y - segment.start.y,
	);
	if (lengthUnits * tileSize <= PIPEWARE_GRIP_SIZE) return;
	const widthMM = getPipewareChannelWidth(
		tileSize,
		segment.widthUnits ?? base.params.channelWidthUnits ?? base.params.widthUnits,
	);
	for (let index = 0; index < Math.floor(lengthUnits); index++) {
		const startDistance =
			index + PIPEWARE_GRIP_SPACING_FROM_CHANNEL / tileSize;
		const endDistance =
			index +
			(PIPEWARE_GRIP_SIZE + PIPEWARE_GRIP_SPACING_FROM_CHANNEL) / tileSize;
		if (endDistance > lengthUnits + PIPEWARE_EPSILON) continue;
		const start = interpolateLinePoint(segment, startDistance);
		const end = interpolateLinePoint(segment, endDistance);
		for (const side of [-1, 1]) {
			const profile = createPipewareGripProfile(widthMM, side, height);
			const grip = buildGripModel(
				Manifold,
				Mesh,
				triangulate,
				profile,
				buildStraightGripStations(start, end, placement, base, tileSize),
				height,
			);
			if (grip && !grip.isEmpty()) models.push(grip);
		}
	}
}

function getPlacementGripLineSegments(base) {
	if (base.type === "D" || base.type === "S") {
		const layout = getOffsetBendLayout(base.type, base.params);
		const widthUnits = layout.widthUnits ?? base.params.widthUnits;
		if (layout.isStraight) {
			return [{ start: layout.start, end: layout.end, widthUnits }];
		}
		const segments = [];
		if ((base.params.lengthUnitsBottom ?? 0) > 0) {
			segments.push({
				start: layout.start,
				end: base.type === "D" ? layout.firstCorner : layout.firstCurveStart,
				widthUnits,
			});
		}
		if ((base.params.lengthUnitsTop ?? 0) > 0) {
			segments.push({
				start: base.type === "D" ? layout.secondCorner : layout.secondCurveEnd,
				end: layout.end,
				widthUnits,
			});
		}
		return segments.filter(
			(segment) =>
				Math.hypot(
					segment.end.x - segment.start.x,
					segment.end.y - segment.start.y,
				) > PIPEWARE_EPSILON,
		);
	}

	if (base.type === "T") {
		const center = getTJunctionCenter(base.params);
		const legacyWidthUnits = base.params.widthUnits ?? 1;
		const widthUnitsX = base.params.widthUnitsX ?? legacyWidthUnits;
		const widthUnitsY = base.params.widthUnitsY ?? legacyWidthUnits;
		const halfWidthX = widthUnitsX / 2;
		const segments = [];
		segments.push({
			start: { x: 0, y: center.y },
			end: { x: base.width, y: center.y },
			widthUnits: widthUnitsX,
		});
		if ((base.params.lengthUnitsY ?? 0) > 0) {
			segments.push({
				start: { x: center.x, y: center.y + halfWidthX },
				end: { x: center.x, y: base.height },
				widthUnits: widthUnitsY,
			});
		}
		return segments;
	}

	if (base.type === "X") {
		const center = getXJunctionCenter(base.params);
		const legacyWidthUnits = base.params.widthUnits ?? 1;
		const widthUnitsX = base.params.widthUnitsX ?? legacyWidthUnits;
		const widthUnitsY = base.params.widthUnitsY ?? legacyWidthUnits;
		const halfWidthX = widthUnitsX / 2;
		const halfWidthY = widthUnitsY / 2;
		const segments = [];
		if ((base.params.lengthUnitsLeft ?? 0) > 0) {
			segments.push({
				start: { x: 0, y: center.y },
				end: { x: center.x - halfWidthY, y: center.y },
				widthUnits: widthUnitsX,
			});
		}
		if ((base.params.lengthUnitsRight ?? 0) > 0) {
			segments.push({
				start: { x: center.x + halfWidthY, y: center.y },
				end: { x: base.width, y: center.y },
				widthUnits: widthUnitsX,
			});
		}
		if ((base.params.lengthUnitsTop ?? 0) > 0) {
			segments.push({
				start: { x: center.x, y: 0 },
				end: { x: center.x, y: center.y - halfWidthX },
				widthUnits: widthUnitsY,
			});
		}
		if ((base.params.lengthUnitsBottom ?? 0) > 0) {
			segments.push({
				start: { x: center.x, y: center.y + halfWidthX },
				end: { x: center.x, y: base.height },
				widthUnits: widthUnitsY,
			});
		}
		return segments;
	}

	return getPipewareBaseLineSegments(base.geometry);
}

function addPlacementGripModels(
	models,
	Manifold,
	Mesh,
	triangulate,
	placement,
	base,
	tileSize,
	height,
) {
	if (!base.geometry) {
		if (base.type === "I") {
			addStraightGripModels(
				models,
				Manifold,
				Mesh,
				triangulate,
				placement,
				base,
				tileSize,
				height,
			);
		} else {
			addCornerGripModels(
				models,
				Manifold,
				Mesh,
				triangulate,
				placement,
				base,
				tileSize,
				height,
			);
		}
		return;
	}
	for (const segment of getPlacementGripLineSegments(base)) {
		addLineSegmentGripModels(
			models,
			Manifold,
			Mesh,
			triangulate,
			placement,
			base,
			tileSize,
			height,
			segment,
		);
	}
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

function getOpeningCutHalfWidth(tileSize) {
	return Math.max(PIPEWARE_EPSILON, getPipewareOpeningCutHalfWidth(tileSize));
}

function createOpeningCutProfile(tangentOffset, height, tileSize) {
	const halfDepth = PIPEWARE_OPENING_CUT_DEPTH / 2;
	const halfWidth = getOpeningCutHalfWidth(tileSize);
	const cornerRadius = Math.min(
		PIPEWARE_CORD_CUTOUT_CHAMFER,
		halfWidth - PIPEWARE_EPSILON,
	);
	const clampedOffset = Math.max(
		-halfWidth,
		Math.min(halfWidth, tangentOffset),
	);
	const roundedSpan = Math.max(0, Math.abs(clampedOffset) - (halfWidth - cornerRadius));
	const edgeInset =
		roundedSpan <= PIPEWARE_EPSILON
			? 0
			: cornerRadius -
				Math.sqrt(
					Math.max(0, cornerRadius * cornerRadius - roundedSpan * roundedSpan),
				);
	const zLow =
		PIPEWARE_SNAP_WALL_THICKNESS + PIPEWARE_OPENING_COVER_CLEARANCE;
	const zHigh = getPipewareWallTopZ(height) + PIPEWARE_BOOLEAN_OVERLAP;
	const zMin = Math.min(zLow + edgeInset, zHigh - PIPEWARE_EPSILON);
	const zMax = Math.max(zMin + PIPEWARE_EPSILON, zHigh);
	return [
		[-halfDepth, zMin],
		[halfDepth, zMin],
		[halfDepth, zMax],
		[-halfDepth, zMax],
	];
}

function getOpeningCutTangentOffsets(tileSize, circleSegments) {
	const halfWidth = getOpeningCutHalfWidth(tileSize);
	const cornerRadius = Math.min(
		PIPEWARE_CORD_CUTOUT_CHAMFER,
		halfWidth - PIPEWARE_EPSILON,
	);
	const cornerSteps = getArcSegmentCount(0, Math.PI / 2, circleSegments);
	const offsets = [];
	for (let index = 0; index <= cornerSteps; index++) {
		offsets.push(-halfWidth + (cornerRadius * index) / cornerSteps);
	}
	offsets.push(0);
	for (let index = 0; index <= cornerSteps; index++) {
		offsets.push(halfWidth - cornerRadius + (cornerRadius * index) / cornerSteps);
	}
	offsets.sort((a, b) => a - b);
	return offsets.filter(
		(offset, index) =>
			index === 0 || Math.abs(offset - offsets[index - 1]) > PIPEWARE_EPSILON,
	);
}

function getPipewareInnerHeight(profileHeight) {
	return Math.max(0, profileHeight);
}

function getPipewareWallTopZ(innerHeight) {
	return PIPEWARE_TOP_CHAMFER + getPipewareInnerHeight(innerHeight);
}

function getPipewareGripTopZ(innerHeight) {
	return getPipewareWallTopZ(innerHeight) + PIPEWARE_BASE_HEIGHT;
}

function getOpeningCutCenterInsetUnits(tileSize) {
	return getPipewareOpeningCutCenterInsetUnits(tileSize);
}

function getSampledOpeningLookupSide(base, side) {
	if (base.type === "L") {
		if (side === "L") return "R";
		if (side === "R") return "L";
	}
	return side;
}

function getOpeningOutsideNormal(tangent, side) {
	const sideSign = side === "L" ? 1 : -1;
	return {
		x: -tangent.y * sideSign,
		y: tangent.x * sideSign,
	};
}

function buildOpeningCutStationsFromLocalCenterLine(
	placement,
	base,
	centerLocal,
	tangentLocal,
	outsideNormalLocal,
	tileSize,
	circleSegments,
) {
	const center = transformBasePointToWorld(
		centerLocal,
		placement,
		base,
		tileSize,
	);
	const tangentWorld = transformBaseVectorToWorld(
		centerLocal,
		tangentLocal,
		placement,
		base,
		tileSize,
	);
	const normal = transformBaseVectorToWorld(
		centerLocal,
		outsideNormalLocal,
		placement,
		base,
		tileSize,
	);
	return getOpeningCutTangentOffsets(tileSize, circleSegments).map((offset) => ({
		center: [
			center[0] + tangentWorld[0] * offset,
			center[1] + tangentWorld[1] * offset,
		],
		normal,
		tangentOffset: offset,
	}));
}

function buildOpeningCutStationsFromBaseLine(
	placement,
	base,
	centerlinePoint,
	tangentLocal,
	side,
	tileSize,
	circleSegments,
) {
	const outsideNormal = getOpeningOutsideNormal(tangentLocal, side);
	const halfWidth = (base.geometry?.widthUnits ?? base.params.widthUnits) / 2;
	const cutInset = getOpeningCutCenterInsetUnits(tileSize);
	const centerLocal = {
		x: centerlinePoint.x + outsideNormal.x * (halfWidth - cutInset),
		y: centerlinePoint.y + outsideNormal.y * (halfWidth - cutInset),
	};
	return buildOpeningCutStationsFromLocalCenterLine(
		placement,
		base,
		centerLocal,
		tangentLocal,
		outsideNormal,
		tileSize,
		circleSegments,
	);
}

function pushSampledOpeningCutStations(
	groups,
	placement,
	base,
	segment,
	t,
	side,
	tileSize,
	circleSegments,
) {
	const centerlinePoint = pointAtPipewareSegment(segment, t);
	const tangent = tangentAtPipewareSegment(segment, t);
	const stations = buildOpeningCutStationsFromBaseLine(
		placement,
		base,
		centerlinePoint,
		tangent,
		side,
		tileSize,
		circleSegments,
	);
	if (stations.length >= 2) groups.push(stations);
}

function buildStraightOpeningCutStations(
	placement,
	edgeKey,
	tileSize,
	circleSegments,
) {
	const line = getPipewareOpeningLineLocal(placement, edgeKey);
	if (!line) return null;
	const parsed = parsePipewareEdgeKey(edgeKey);
	if (!parsed) return null;
	const lineDx = line.end.x - line.start.x;
	const lineDy = line.end.y - line.start.y;
	const lineLength = Math.hypot(lineDx, lineDy);
	if (lineLength <= PIPEWARE_EPSILON) return null;
	const visualCenter = {
		x: (line.start.x + line.end.x) / 2,
		y: (line.start.y + line.end.y) / 2,
	};
	const edgeToCenter = {
		x: visualCenter.x - parsed.tx,
		y: visualCenter.y - parsed.ty,
	};
	const edgeToCenterLength = Math.hypot(edgeToCenter.x, edgeToCenter.y);
	if (edgeToCenterLength <= PIPEWARE_EPSILON) return null;
	const normalLocal = {
		x: edgeToCenter.x / edgeToCenterLength,
		y: edgeToCenter.y / edgeToCenterLength,
	};
	const centerLocal = {
		x: parsed.tx + normalLocal.x * getOpeningCutCenterInsetUnits(tileSize),
		y: parsed.ty + normalLocal.y * getOpeningCutCenterInsetUnits(tileSize),
	};
	const center = transformLocalPointToWorld(centerLocal, placement, tileSize);
	const normal = transformLocalVectorToWorld(normalLocal, tileSize);
	const tangentWorld = transformLocalVectorToWorld(
		{ x: lineDx, y: lineDy },
		tileSize,
	);
	return getOpeningCutTangentOffsets(tileSize, circleSegments).map((offset) => ({
		center: [
			center[0] + tangentWorld[0] * offset,
			center[1] + tangentWorld[1] * offset,
		],
		normal,
		tangentOffset: offset,
	}));
}

const JUNCTION_CORNER_OPENING_SPECS = Object.freeze({
	CNW: Object.freeze([
		Object.freeze({ tangent: { x: 1, y: 0 }, outside: { x: 0, y: -1 } }),
		Object.freeze({ tangent: { x: 0, y: 1 }, outside: { x: -1, y: 0 } }),
	]),
	CNE: Object.freeze([
		Object.freeze({ tangent: { x: 1, y: 0 }, outside: { x: 0, y: -1 } }),
		Object.freeze({ tangent: { x: 0, y: 1 }, outside: { x: 1, y: 0 } }),
	]),
	CSW: Object.freeze([
		Object.freeze({ tangent: { x: 1, y: 0 }, outside: { x: 0, y: 1 } }),
		Object.freeze({ tangent: { x: 0, y: 1 }, outside: { x: -1, y: 0 } }),
	]),
	CSE: Object.freeze([
		Object.freeze({ tangent: { x: 1, y: 0 }, outside: { x: 0, y: 1 } }),
		Object.freeze({ tangent: { x: 0, y: 1 }, outside: { x: 1, y: 0 } }),
	]),
});

function buildJunctionCornerOpeningCutStationGroups(
	placement,
	base,
	edgeKey,
	tileSize,
	circleSegments,
) {
	if (base.type !== "T" && base.type !== "X") return [];
	const parsed = parsePipewareEdgeKey(edgeKey);
	const specs = parsed ? JUNCTION_CORNER_OPENING_SPECS[parsed.side] : null;
	if (!specs) return [];

	const rotationTurns = normalizePipewareRotation(placement.rotation) / 90;
	const boundsWidth = rotationTurns % 2 === 0 ? base.width : base.height;
	const boundsHeight = rotationTurns % 2 === 0 ? base.height : base.width;
	const edgePoint = rotateLocalPointCCWNTimes(
		parsed.tx,
		parsed.ty,
		boundsWidth,
		boundsHeight,
		(4 - rotationTurns) % 4,
	);
	const cutInset = getOpeningCutCenterInsetUnits(tileSize);
	return specs
		.map(({ tangent, outside }) =>
			buildOpeningCutStationsFromLocalCenterLine(
				placement,
				base,
				{
					x: edgePoint.x - outside.x * cutInset,
					y: edgePoint.y - outside.y * cutInset,
				},
				tangent,
				outside,
				tileSize,
				circleSegments,
			),
		)
		.filter((stations) => stations.length >= 2);
}

function buildSampledOpeningCutStationGroups(
	placement,
	base,
	edgeKey,
	tileSize,
	circleSegments,
) {
	if (base.type !== "L" && base.type !== "S" && base.type !== "D") return [];
	const parsed = parsePipewareEdgeKey(edgeKey);
	if (!parsed || (parsed.side !== "L" && parsed.side !== "R")) return [];

	const rotationTurns = normalizePipewareRotation(placement.rotation) / 90;
	const boundsWidth = rotationTurns % 2 === 0 ? base.width : base.height;
	const boundsHeight = rotationTurns % 2 === 0 ? base.height : base.width;
	const edgePoint = rotateLocalPointCCWNTimes(
		parsed.tx,
		parsed.ty,
		boundsWidth,
		boundsHeight,
		(4 - rotationTurns) % 4,
	);
	const sample = findNearestPipewareBaseSideSample(
		base.geometry,
		edgePoint,
		getSampledOpeningLookupSide(base, parsed.side),
	);
	if (
		!sample?.segment ||
		!sample?.pathSegments ||
		!Number.isFinite(sample.segmentIndex) ||
		!Number.isFinite(sample.t)
	) {
		return [];
	}

	const radius = getOpeningCutHalfWidth(tileSize);
	const segmentLengthUnits = segmentLength(sample.segment);
	const junctionThreshold =
		segmentLengthUnits <= PIPEWARE_EPSILON
			? 0
			: (radius + PIPEWARE_CORD_CUTOUT_CHAMFER) /
				(segmentLengthUnits * tileSize);
	const groups = [];
	pushSampledOpeningCutStations(
		groups,
		placement,
		base,
		sample.segment,
		sample.t,
		sample.side,
		tileSize,
		circleSegments,
	);
	if (sample.t <= junctionThreshold && sample.segmentIndex > 0) {
		const previous = sample.pathSegments[sample.segmentIndex - 1];
		pushSampledOpeningCutStations(
			groups,
			placement,
			base,
			previous,
			1,
			sample.side,
			tileSize,
			circleSegments,
		);
	}
	if (
		sample.t >= 1 - junctionThreshold &&
		sample.segmentIndex < sample.pathSegments.length - 1
	) {
		const next = sample.pathSegments[sample.segmentIndex + 1];
		pushSampledOpeningCutStations(
			groups,
			placement,
			base,
			next,
			0,
			sample.side,
			tileSize,
			circleSegments,
		);
	}
	return groups;
}

function buildOpeningCutStationGroupsForEdgeKey(
	placement,
	base,
	edgeKey,
	tileSize,
	circleSegments,
) {
	const junctionCornerGroups = buildJunctionCornerOpeningCutStationGroups(
		placement,
		base,
		edgeKey,
		tileSize,
		circleSegments,
	);
	if (junctionCornerGroups.length) return junctionCornerGroups;
	const sampledGroups = buildSampledOpeningCutStationGroups(
		placement,
		base,
		edgeKey,
		tileSize,
		circleSegments,
	);
	if (sampledGroups.length) return sampledGroups;
	return [
		buildStraightOpeningCutStations(
			placement,
			edgeKey,
			tileSize,
			circleSegments,
		),
	].filter(Boolean);
}

function getStationGroupLength(stations) {
	if (stations.length < 2) return 0;
	const first = stations[0];
	const last = stations[stations.length - 1];
	return Math.hypot(
		last.center[0] - first.center[0],
		last.center[1] - first.center[1],
	);
}

function getPrimaryOpeningStationGroup(stationGroups) {
	return stationGroups.reduce(
		(best, stations) =>
			!best || getStationGroupLength(stations) > getStationGroupLength(best)
				? stations
				: best,
		null,
	);
}

function getOpeningStationGroupCenter(stations) {
	return averageOpeningPoints((stations ?? []).map((station) => station.center));
}

function findOpeningStationCenterPair(a, b) {
	const centerA = getOpeningStationGroupCenter(a);
	const centerB = getOpeningStationGroupCenter(b);
	if (!centerA || !centerB) return null;
	return {
		a: { center: centerA },
		b: { center: centerB },
		distance: Math.hypot(centerB[0] - centerA[0], centerB[1] - centerA[1]),
	};
}

function averageOpeningPoints(points) {
	if (!points.length) return null;
	const sum = points.reduce(
		(total, point) => [total[0] + point[0], total[1] + point[1]],
		[0, 0],
	);
	return [sum[0] / points.length, sum[1] / points.length];
}

function normalizeOpeningVector(vector, fallback = [1, 0]) {
	const length = Math.hypot(vector[0], vector[1]);
	if (length <= PIPEWARE_EPSILON) return fallback;
	return [vector[0] / length, vector[1] / length];
}

function alignOpeningVector(vector, reference) {
	const dot = vector[0] * reference[0] + vector[1] * reference[1];
	return dot < 0 ? [-vector[0], -vector[1]] : vector;
}

function getStationGroupDirection(stations) {
	if (!stations || stations.length < 2) return null;
	const first = stations[0];
	const last = stations[stations.length - 1];
	return normalizeOpeningVector([
		last.center[0] - first.center[0],
		last.center[1] - first.center[1],
	]);
}

function isAxisAlignedOpeningVector(vector) {
	return Math.min(Math.abs(vector[0]), Math.abs(vector[1])) <= 0.04;
}

function getPreferredMergedOpeningCandidate(candidates, base) {
	if (base.type !== "D") return null;
	return (
		candidates.find((candidate) => {
			const direction = getStationGroupDirection(candidate.primaryStations);
			return direction && !isAxisAlignedOpeningVector(direction);
		}) ?? null
	);
}

function createMergedOpeningCutStationGroup(
	candidates,
	tileSize,
	base,
	circleSegments,
) {
	const mergePoints = [];
	for (let index = 0; index < candidates.length; index++) {
		for (let nextIndex = index + 1; nextIndex < candidates.length; nextIndex++) {
			const pair = findOpeningStationCenterPair(
				candidates[index].primaryStations,
				candidates[nextIndex].primaryStations,
			);
			if (!pair || pair.distance > tileSize * 0.45) continue;
			mergePoints.push(pair.a.center, pair.b.center);
		}
	}
	const center = averageOpeningPoints(mergePoints);
	if (!center) return null;

	const preferredCandidate = getPreferredMergedOpeningCandidate(candidates, base);
	if (preferredCandidate) {
		const tangent = getStationGroupDirection(preferredCandidate.primaryStations);
		const normal = normalizeOpeningVector(
			preferredCandidate.primaryStations[0].normal,
			[-tangent[1], tangent[0]],
		);
		return getOpeningCutTangentOffsets(tileSize, circleSegments).map((offset) => ({
			center: [
				center[0] + tangent[0] * offset,
				center[1] + tangent[1] * offset,
			],
			normal,
			tangentOffset: offset,
		}));
	}

	const directions = [];
	const normals = [];
	for (const candidate of candidates) {
		const stations = candidate.primaryStations;
		const endpoints = [stations[0], stations[stations.length - 1]];
		const far =
			Math.hypot(
				endpoints[0].center[0] - center[0],
				endpoints[0].center[1] - center[1],
			) >
			Math.hypot(
				endpoints[1].center[0] - center[0],
				endpoints[1].center[1] - center[1],
			)
				? endpoints[0]
				: endpoints[1];
		const direction = normalizeOpeningVector([
			far.center[0] - center[0],
			far.center[1] - center[1],
		]);
		directions.push(direction);
		normals.push(normalizeOpeningVector(stations[0].normal, [-direction[1], direction[0]]));
	}
	if (!directions.length) return null;

	const referenceDirection = directions[0];
	const tangent = normalizeOpeningVector(
		directions
			.map((direction) => alignOpeningVector(direction, referenceDirection))
			.reduce((total, direction) => [
				total[0] + direction[0],
				total[1] + direction[1],
			]),
		referenceDirection,
	);
	const referenceNormal = normals[0] ?? [-tangent[1], tangent[0]];
	const normal = normalizeOpeningVector(
		normals
			.map((candidateNormal) =>
				alignOpeningVector(candidateNormal, referenceNormal),
			)
			.reduce((total, candidateNormal) => [
				total[0] + candidateNormal[0],
				total[1] + candidateNormal[1],
			]),
		[-tangent[1], tangent[0]],
	);

	return getOpeningCutTangentOffsets(tileSize, circleSegments).map((offset) => ({
		center: [
			center[0] + tangent[0] * offset,
			center[1] + tangent[1] * offset,
		],
		normal,
		tangentOffset: offset,
	}));
}

function buildOpeningCutCandidateGroups(
	placement,
	base,
	tileSize,
	circleSegments,
) {
	const activeEdgeCuts = new Set(placement.edgeCuts ?? []);
	const candidates = getPipewarePlacementCuttableEdgeKeys(placement, tileSize)
		.map((edgeKey) => {
			const stationGroups = buildOpeningCutStationGroupsForEdgeKey(
				placement,
				base,
				edgeKey,
				tileSize,
				circleSegments,
			);
			const primaryStations = getPrimaryOpeningStationGroup(stationGroups);
			if (!primaryStations) return null;
			return {
				edgeKey,
				active: activeEdgeCuts.has(edgeKey),
				stationGroups,
				primaryStations,
			};
		})
		.filter(Boolean);
	const parents = candidates.map((_, index) => index);
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
	for (let index = 0; index < candidates.length; index++) {
		for (let nextIndex = index + 1; nextIndex < candidates.length; nextIndex++) {
			const pair = findOpeningStationCenterPair(
				candidates[index].primaryStations,
				candidates[nextIndex].primaryStations,
			);
			if (pair && pair.distance <= tileSize * 0.45) {
				mergeRoots(index, nextIndex);
			}
		}
	}

	const grouped = new Map();
	for (let index = 0; index < candidates.length; index++) {
		const root = findRoot(index);
		if (!grouped.has(root)) grouped.set(root, []);
		grouped.get(root).push(candidates[index]);
	}
	return [...grouped.values()].filter((group) =>
		group.some((candidate) => candidate.active),
	);
}

function normalizeOpeningCutStationOrientation(stations) {
	if (!stations || stations.length < 2) return stations;
	const first = stations[0];
	const second = stations[1];
	const tangent = [
		second.center[0] - first.center[0],
		second.center[1] - first.center[1],
	];
	const cross = tangent[0] * first.normal[1] - tangent[1] * first.normal[0];
	if (cross >= 0) return stations;
	return stations.map((station) => ({
		...station,
		normal: [-station.normal[0], -station.normal[1]],
	}));
}

function buildOpeningCutModels(
	Manifold,
	Mesh,
	triangulate,
	placement,
	base,
	tileSize,
	height,
	circleSegments,
) {
	const cuts = [];
	for (const candidateGroup of buildOpeningCutCandidateGroups(
		placement,
		base,
		tileSize,
		circleSegments,
	)) {
		const stationGroups =
			candidateGroup.length > 1
				? [
						createMergedOpeningCutStationGroup(
							candidateGroup,
							tileSize,
							base,
							circleSegments,
						),
					].filter(Boolean)
				: candidateGroup[0].stationGroups;
		for (const stations of stationGroups) {
			const orientedStations = normalizeOpeningCutStationOrientation(stations);
			const profiles = orientedStations.map((station) =>
				createOpeningCutProfile(station.tangentOffset ?? 0, height, tileSize),
			);
			const cut = buildVariableProfileSweepMesh(
				Manifold,
				Mesh,
				triangulate,
				profiles,
				orientedStations,
			);
			if (cut && !cut.isEmpty()) cuts.push(cut);
		}
	}
	return cuts;
}

function getPipewareChannelStationGroups(
	placement,
	base,
	tileSize,
	circleSegments,
) {
	if (base.type === "S") {
		return getPlacementSegmentStationGroups(
			placement,
			base,
			tileSize,
			circleSegments,
		);
	}
	return getPlacementPathStationGroups(
		placement,
		base,
		tileSize,
		circleSegments,
	);
}

function getPipewareInnerCutStationGroups(
	placement,
	base,
	tileSize,
	circleSegments,
) {
	if (base.type === "S") {
		return getPlacementSegmentStationGroups(
			placement,
			base,
			tileSize,
			circleSegments,
		);
	}
	return getPipewareChannelStationGroups(
		placement,
		base,
		tileSize,
		circleSegments,
	);
}

function buildPipewareChannelShellModel(
	Manifold,
	Mesh,
	triangulate,
	placement,
	base,
	tileSize,
	height,
	circleSegments,
) {
	const stationGroups = getPipewareChannelStationGroups(
		placement,
		base,
		tileSize,
		circleSegments,
	);
	const outerModels = stationGroups
		.map((stations) => {
			const profile = createPipewareOuterProfile(
				getPipewareChannelWidth(
					tileSize,
					stations.widthUnits ?? base.params.widthUnits,
				),
				height,
			);
			return buildSweepMesh(Manifold, Mesh, triangulate, profile, stations);
		})
		.filter((model) => model && !model.isEmpty());
	return outerModels.length ? unionAll(Manifold, outerModels) : null;
}

function buildPipewareChannelInnerCutModels(
	Manifold,
	Mesh,
	triangulate,
	placement,
	base,
	tileSize,
	height,
	circleSegments,
) {
	return getPipewareInnerCutStationGroups(
		placement,
		base,
		tileSize,
		circleSegments,
	)
		.map((stations) => {
			const innerCutProfile = createPipewareInnerCutProfile(
				getPipewareChannelWidth(
					tileSize,
					stations.widthUnits ?? base.params.widthUnits,
				),
				height,
			);
			return buildSweepMesh(
				Manifold,
				Mesh,
				triangulate,
				innerCutProfile,
				extendStationsAlongPath(stations, PIPEWARE_BOOLEAN_OVERLAP),
			);
		})
		.filter((model) => model && !model.isEmpty());
}

function buildPipewarePlacementModel(
	Manifold,
	Mesh,
	triangulate,
	placement,
	tileSize,
	height,
	circleSegments,
) {
	const base = getPlacementBaseDimensions(placement);
	const shell = buildPipewareChannelShellModel(
		Manifold,
		Mesh,
		triangulate,
		placement,
		base,
		tileSize,
		height,
	);
	if (!shell || shell.isEmpty()) return null;
	const cutModels = buildOpeningCutModels(
		Manifold,
		Mesh,
		triangulate,
		placement,
		base,
		tileSize,
		height,
		circleSegments,
	);
	const cutShell = cutModels.length
		? shell.subtract(unionAll(Manifold, cutModels))
		: shell;
	const models = [cutShell];
	addPlacementGripModels(
		models,
		Manifold,
		Mesh,
		triangulate,
		placement,
		base,
		tileSize,
		height,
	);
	let model = unionAll(Manifold, models);
	const innerCutModels = buildPipewareChannelInnerCutModels(
		Manifold,
		Mesh,
		triangulate,
		placement,
		base,
		tileSize,
		height,
		circleSegments,
	);
	if (innerCutModels.length) {
		model = model.subtract(unionAll(Manifold, innerCutModels));
	}
	return model;
}

function clampNonNegative(value, fallback) {
	const number = Number(value);
	return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function resolvePipewareBoardInnerHeight(config = {}) {
	return Math.max(
		PIPEWARE_THICKNESS_MIN,
		clampNonNegative(
			config.pipewareBoardThicknessValue ??
				config.pipewareHeightValue ??
				config.channelHeightValue,
			PIPEWARE_DEFAULT_HEIGHT,
		),
	);
}

function resolvePipewarePlacementInnerHeight(placement, boardInnerHeight) {
	const partHeight = Number(placement?.params?.zHeightValue);
	return Number.isFinite(partHeight) && partHeight > 0
		? clampNonNegative(partHeight, boardInnerHeight)
		: boardInnerHeight;
}

function getPipewarePlacementModelName(placement, index) {
	const type = normalizePipewareFeatureType(placement?.type).toLowerCase();
	const id = String(placement?.id ?? "")
		.trim()
		.replace(/[^a-z0-9_-]+/gi, "_")
		.replace(/^_+|_+$/g, "");
	return id
		? `pipeware_${index + 1}_${type}_${id}`
		: `pipeware_${index + 1}_${type}`;
}

function flattenGLTFExportWrapper(doc) {
	for (const scene of doc.getRoot().listScenes()) {
		for (const rootNode of scene.listChildren()) {
			if (rootNode.getName() !== "wrapper") continue;
			for (const child of rootNode.listChildren()) {
				const matrix = child.getWorldMatrix();
				rootNode.removeChild(child);
				child.setMatrix(matrix);
				scene.addChild(child);
			}
			scene.removeChild(rootNode);
			rootNode.dispose();
		}
	}
	return doc;
}

async function buildPipewarePlacementModels(config = {}) {
	const { Manifold, Mesh, triangulate } = await getManifoldApi();
	const tileSize = clampPositive(config.tileSizeValue, PIPEWARE_DEFAULT_TILE_SIZE);
	const circleSegments = clampPositiveInteger(
		config.circleSegmentsValue,
		PIPEWARE_DEFAULT_CIRCLE_SEGMENTS,
	);
	const boardInnerHeight = resolvePipewareBoardInnerHeight(config);
	const placements = (config.pipewarePlacements ?? [])
		.map((placement) => normalizePipewarePlacement(placement))
		.filter((placement) => placement.id);
	if (!placements.length) {
		throw new Error("Add at least one Pipeware part to preview.");
	}

	const parts = placements
		.map((placement, index) => {
			const model = buildPipewarePlacementModel(
				Manifold,
				Mesh,
				triangulate,
				placement,
				tileSize,
				resolvePipewarePlacementInnerHeight(placement, boardInnerHeight),
				circleSegments,
			);
			return model && !model.isEmpty()
				? {
						model,
						name: getPipewarePlacementModelName(placement, index),
						placement,
					}
				: null;
		})
		.filter(Boolean);
	if (!parts.length) {
		throw new Error("Pipeware geometry produced no solids.");
	}
	return parts;
}

export async function warmPipewareGeometry() {
	await warmManifoldRuntime();
}

export async function renderPipewarePreviewMesh(config) {
	const parts = await buildPipewarePlacementModels(config);
	return {
		mesh: buildPreviewMeshFromModels(parts.map((part) => part.model)),
		logs: ["Pipeware preview: Manifold"],
	};
}

export async function renderPipewareExport(config, format = "stl-binary") {
	const parts = await buildPipewarePlacementModels(config);
	const models = parts.map((part) => part.model);
	const names = parts.map((part) => part.name);

	if (format === "3mf") {
		const nodes = parts.map((part) => {
			const node = new GLTFNode();
			node.name = part.name;
			node.manifold = part.model;
			return node;
		});
		const doc = flattenGLTFExportWrapper(await GLTFNodesToGLTFDoc(nodes));
		const buffer = await export3mfToArrayBuffer(doc);
		return {
			bytes: new Uint8Array(buffer),
			mimeType: "model/3mf",
			extension: "3mf",
			logs: [`Pipeware export: 3MF (${parts.length} parts)`],
		};
	}

	if (format === "stl-ascii") {
		return {
			bytes: buildAsciiStlFromModels(models, names),
			mimeType: "model/stl",
			extension: "stl",
			logs: [`Pipeware export: ASCII STL (${parts.length} solids)`],
		};
	}

	return {
		bytes: buildBinaryStlFromModels(models),
		mimeType: "model/stl",
		extension: "stl",
		logs: [`Pipeware export: Binary STL (${parts.length} shells)`],
	};
}
