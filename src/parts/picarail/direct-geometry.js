import { manifoldToGLTFDoc } from "manifold-3d/lib/scene-builder";
import { toArrayBuffer as export3mfToArrayBuffer } from "manifold-3d/lib/export-3mf";
import {
	buildAsciiStlFromModels,
	buildBinaryStlFromModels,
	buildPreviewMeshFromModels,
} from "../pipeware/geometry/exporters.js";
import {
	PICA_OPEN_GRID_LENGTH_MAX,
	PICA_OPEN_GRID_LENGTH_MIN,
	PICA_OPEN_GRID_TILE_SIZE_DEFAULT,
	PICA_OPEN_GRID_TILE_SIZE_MAX,
	PICA_OPEN_GRID_TILE_SIZE_MIN,
	PICA_RAIL_BASE_WIDTH,
	PICA_RAIL_BODY_HEIGHT,
	PICA_RAIL_HEIGHT,
	PICA_RAIL_LOWER_SHOULDER_HEIGHT,
	PICA_RAIL_TOP_FLAT_WIDTH,
	PICA_RAIL_TOP_WIDTH,
	PICA_RAIL_UPPER_SHOULDER_HEIGHT,
	PICA_SCREW_HOLE_CONE_BOTTOM_RADIUS,
	PICA_SCREW_HOLE_CONE_BOTTOM_Z,
	PICA_SCREW_HOLE_CONE_TOP_Z,
	PICA_SCREW_HOLE_HEAD_RADIUS,
	PICA_SCREW_HOLE_RADIUS,
	PICA_SCREW_HOLE_SEGMENTS_DEFAULT,
	PICA_SCREW_HOLE_SEGMENTS_MAX,
	PICA_SCREW_HOLE_SEGMENTS_MIN,
	PICA_SLOT_DEPTH,
	PICA_TILE_OFFSET,
	PICA_TILE_PITCH,
	PICA_TILE_SLOT_WIDTH,
} from "./constants.js";
import { getManifoldApi, warmManifoldRuntime } from "../shared/geometry/manifold-runtime.js";

const PICA_SLOT_FLOOR_HALF_WIDTH = 9.765;
const PICA_SLOT_SIDE_LOWER_HALF_WIDTH = 9.94073593128807;
const PICA_SLOT_SIDE_LOWER_HEIGHT = 5.89573593128807;
const PICA_SLOT_SIDE_UPPER_HALF_WIDTH = 9.53596189432334;
const PICA_SLOT_SIDE_UPPER_HEIGHT = 7.61903810567666;
const PICA_SLOT_TOP_CHAMFER_HALF_WIDTH = 8.18141016151378;
const PICA_SLOT_TOP_CHAMFER_HEIGHT = 8.97358983848622;

const PICA_SLOT_FLOOR_RUN = 0.16794919243112;
const PICA_SLOT_TOP_CHAMFER_RUN = 0.2;
const PICA_SLOT_SIDE_UPPER_RUN = 0.58205080756888;
const PICA_SLOT_OUTER_UPPER_RUN = 0.13102743701398;
const PICA_SLOT_OUTER_LOWER_RUN = 0.19557119535711;
const PICA_SLOT_SIDE_LOWER_RUN = 0.41289816670944;

const PICA_RAIL_TILE_FACES = [
	[0, 1, 2, 3],
	[3, 2, 4, 5, 6, 7, 8, 9, 10, 11],
	[2, 1, 12, 13, 14, 15, 16, 4],
	[14, 17, 18, 15],
	[15, 18, 19, 20, 21, 22, 23, 24, 25, 16],
	[26, 27, 9, 8],
	[9, 27, 28, 29, 30, 10],
	[31, 32, 22, 21],
	[31, 21, 20, 33, 34, 35],
	[7, 6, 24, 23],
	[24, 6, 5, 25],
	[16, 25, 5, 4],
	[30, 29, 36, 37],
	[30, 37, 11, 10],
	[38, 39, 34, 33],
	[18, 17, 40, 39, 38, 19],
	[38, 33, 20, 19],
	[0, 3, 11, 37, 36, 41],
	[36, 29, 28, 41],
	[17, 14, 13, 42, 43, 44, 32, 31, 35, 40],
	[43, 45, 46, 44],
	[26, 8, 7, 23, 22, 32, 44, 46],
	[34, 39, 40, 35],
	[13, 12, 47, 42],
	[42, 47, 45, 43],
	[1, 0, 41, 28, 27, 26, 46, 45, 47, 12],
];
const PICA_RAIL_TILE_START_CAP_FACE_INDEX = 19;
const PICA_RAIL_TILE_END_CAP_FACE_INDEX = 25;

function clampInteger(raw, min, max, fallback) {
	const value = Number(raw);
	if (!Number.isFinite(value)) return fallback;
	return Math.max(min, Math.min(max, Math.round(value)));
}

function clampNumber(raw, min, max, fallback) {
	const value = Number(raw);
	if (!Number.isFinite(value)) return fallback;
	return Math.max(min, Math.min(max, value));
}

function emptyManifold(Manifold) {
	return Manifold.hull([]);
}

function unionAll(Manifold, items) {
	if (!items.length) return emptyManifold(Manifold);
	if (items.length === 1) return items[0];
	return Manifold.union(items);
}

function createPicaRailProfile(CrossSection) {
	const baseHalfWidth = PICA_RAIL_BASE_WIDTH / 2;
	const shoulderHalfWidth = PICA_RAIL_TOP_WIDTH / 2;
	const topFlatHalfWidth = PICA_RAIL_TOP_FLAT_WIDTH / 2;
	return new CrossSection([
		[
			[-baseHalfWidth, 0],
			[baseHalfWidth, 0],
			[baseHalfWidth, PICA_RAIL_BODY_HEIGHT],
			[shoulderHalfWidth, PICA_RAIL_LOWER_SHOULDER_HEIGHT],
			[shoulderHalfWidth, PICA_RAIL_UPPER_SHOULDER_HEIGHT],
			[topFlatHalfWidth, PICA_RAIL_HEIGHT],
			[-topFlatHalfWidth, PICA_RAIL_HEIGHT],
			[-shoulderHalfWidth, PICA_RAIL_UPPER_SHOULDER_HEIGHT],
			[-shoulderHalfWidth, PICA_RAIL_LOWER_SHOULDER_HEIGHT],
			[-baseHalfWidth, PICA_RAIL_BODY_HEIGHT],
		],
	]);
}

function mirrorSlotX(x) {
	return PICA_TILE_PITCH - x;
}

function createPicaRailTileVertices() {
	const baseHalfWidth = PICA_RAIL_BASE_WIDTH / 2;
	const shoulderHalfWidth = PICA_RAIL_TOP_WIDTH / 2;
	const slotStart = PICA_TILE_OFFSET;
	const slotEnd = slotStart + PICA_TILE_SLOT_WIDTH;
	const floorStart = slotStart + PICA_SLOT_FLOOR_RUN;
	const floorEnd = mirrorSlotX(floorStart);
	const topChamferStart = slotStart + PICA_SLOT_TOP_CHAMFER_RUN;
	const topChamferEnd = mirrorSlotX(topChamferStart);
	const frontSideUpperX = slotStart - PICA_SLOT_SIDE_UPPER_RUN;
	const frontOuterUpperX = slotStart - PICA_SLOT_OUTER_UPPER_RUN;
	const frontOuterLowerX = slotStart + PICA_SLOT_OUTER_LOWER_RUN;
	const frontSideLowerX = slotStart + PICA_SLOT_SIDE_LOWER_RUN;
	const rearSideUpperX = mirrorSlotX(frontSideUpperX);
	const rearOuterUpperX = mirrorSlotX(frontOuterUpperX);
	const rearOuterLowerX = mirrorSlotX(frontOuterLowerX);
	const rearSideLowerX = mirrorSlotX(frontSideLowerX);
	const slotFloorZ = PICA_RAIL_HEIGHT - PICA_SLOT_DEPTH;

	return [
		[PICA_TILE_PITCH, shoulderHalfWidth, PICA_RAIL_UPPER_SHOULDER_HEIGHT],
		[PICA_TILE_PITCH, shoulderHalfWidth, PICA_RAIL_LOWER_SHOULDER_HEIGHT],
		[rearOuterLowerX, shoulderHalfWidth, PICA_RAIL_LOWER_SHOULDER_HEIGHT],
		[rearOuterUpperX, shoulderHalfWidth, PICA_RAIL_UPPER_SHOULDER_HEIGHT],
		[rearSideLowerX, PICA_SLOT_SIDE_LOWER_HALF_WIDTH, PICA_SLOT_SIDE_LOWER_HEIGHT],
		[floorEnd, PICA_SLOT_FLOOR_HALF_WIDTH, slotFloorZ],
		[floorEnd, -PICA_SLOT_FLOOR_HALF_WIDTH, slotFloorZ],
		[rearSideLowerX, -PICA_SLOT_SIDE_LOWER_HALF_WIDTH, PICA_SLOT_SIDE_LOWER_HEIGHT],
		[rearOuterLowerX, -shoulderHalfWidth, PICA_RAIL_LOWER_SHOULDER_HEIGHT],
		[rearOuterUpperX, -shoulderHalfWidth, PICA_RAIL_UPPER_SHOULDER_HEIGHT],
		[rearSideUpperX, -PICA_SLOT_SIDE_UPPER_HALF_WIDTH, PICA_SLOT_SIDE_UPPER_HEIGHT],
		[rearSideUpperX, PICA_SLOT_SIDE_UPPER_HALF_WIDTH, PICA_SLOT_SIDE_UPPER_HEIGHT],
		[PICA_TILE_PITCH, baseHalfWidth, PICA_RAIL_BODY_HEIGHT],
		[0, baseHalfWidth, PICA_RAIL_BODY_HEIGHT],
		[0, shoulderHalfWidth, PICA_RAIL_LOWER_SHOULDER_HEIGHT],
		[frontOuterLowerX, shoulderHalfWidth, PICA_RAIL_LOWER_SHOULDER_HEIGHT],
		[frontSideLowerX, PICA_SLOT_SIDE_LOWER_HALF_WIDTH, PICA_SLOT_SIDE_LOWER_HEIGHT],
		[0, shoulderHalfWidth, PICA_RAIL_UPPER_SHOULDER_HEIGHT],
		[frontOuterUpperX, shoulderHalfWidth, PICA_RAIL_UPPER_SHOULDER_HEIGHT],
		[frontSideUpperX, PICA_SLOT_SIDE_UPPER_HALF_WIDTH, PICA_SLOT_SIDE_UPPER_HEIGHT],
		[frontSideUpperX, -PICA_SLOT_SIDE_UPPER_HALF_WIDTH, PICA_SLOT_SIDE_UPPER_HEIGHT],
		[frontOuterUpperX, -shoulderHalfWidth, PICA_RAIL_UPPER_SHOULDER_HEIGHT],
		[frontOuterLowerX, -shoulderHalfWidth, PICA_RAIL_LOWER_SHOULDER_HEIGHT],
		[frontSideLowerX, -PICA_SLOT_SIDE_LOWER_HALF_WIDTH, PICA_SLOT_SIDE_LOWER_HEIGHT],
		[floorStart, -PICA_SLOT_FLOOR_HALF_WIDTH, slotFloorZ],
		[floorStart, PICA_SLOT_FLOOR_HALF_WIDTH, slotFloorZ],
		[PICA_TILE_PITCH, -shoulderHalfWidth, PICA_RAIL_LOWER_SHOULDER_HEIGHT],
		[PICA_TILE_PITCH, -shoulderHalfWidth, PICA_RAIL_UPPER_SHOULDER_HEIGHT],
		[PICA_TILE_PITCH, -baseHalfWidth, PICA_RAIL_HEIGHT],
		[slotEnd, -baseHalfWidth, PICA_RAIL_HEIGHT],
		[topChamferEnd, -PICA_SLOT_TOP_CHAMFER_HALF_WIDTH, PICA_SLOT_TOP_CHAMFER_HEIGHT],
		[0, -shoulderHalfWidth, PICA_RAIL_UPPER_SHOULDER_HEIGHT],
		[0, -shoulderHalfWidth, PICA_RAIL_LOWER_SHOULDER_HEIGHT],
		[topChamferStart, -PICA_SLOT_TOP_CHAMFER_HALF_WIDTH, PICA_SLOT_TOP_CHAMFER_HEIGHT],
		[slotStart, -baseHalfWidth, PICA_RAIL_HEIGHT],
		[0, -baseHalfWidth, PICA_RAIL_HEIGHT],
		[slotEnd, baseHalfWidth, PICA_RAIL_HEIGHT],
		[topChamferEnd, PICA_SLOT_TOP_CHAMFER_HALF_WIDTH, PICA_SLOT_TOP_CHAMFER_HEIGHT],
		[topChamferStart, PICA_SLOT_TOP_CHAMFER_HALF_WIDTH, PICA_SLOT_TOP_CHAMFER_HEIGHT],
		[slotStart, baseHalfWidth, PICA_RAIL_HEIGHT],
		[0, baseHalfWidth, PICA_RAIL_HEIGHT],
		[PICA_TILE_PITCH, baseHalfWidth, PICA_RAIL_HEIGHT],
		[0, baseHalfWidth, 0],
		[0, -baseHalfWidth, 0],
		[0, -baseHalfWidth, PICA_RAIL_BODY_HEIGHT],
		[PICA_TILE_PITCH, -baseHalfWidth, 0],
		[PICA_TILE_PITCH, -baseHalfWidth, PICA_RAIL_BODY_HEIGHT],
		[PICA_TILE_PITCH, baseHalfWidth, 0],
	];
}

function createPicaRailProfileLoop(x) {
	const baseHalfWidth = PICA_RAIL_BASE_WIDTH / 2;
	const shoulderHalfWidth = PICA_RAIL_TOP_WIDTH / 2;
	return [
		[x, shoulderHalfWidth, PICA_RAIL_UPPER_SHOULDER_HEIGHT],
		[x, shoulderHalfWidth, PICA_RAIL_LOWER_SHOULDER_HEIGHT],
		[x, baseHalfWidth, PICA_RAIL_BODY_HEIGHT],
		[x, baseHalfWidth, 0],
		[x, -baseHalfWidth, 0],
		[x, -baseHalfWidth, PICA_RAIL_BODY_HEIGHT],
		[x, -shoulderHalfWidth, PICA_RAIL_LOWER_SHOULDER_HEIGHT],
		[x, -shoulderHalfWidth, PICA_RAIL_UPPER_SHOULDER_HEIGHT],
		[x, -baseHalfWidth, PICA_RAIL_HEIGHT],
		[x, baseHalfWidth, PICA_RAIL_HEIGHT],
	];
}

function getMeshPoint(vertices, index) {
	const offset = index * 3;
	return [vertices[offset], vertices[offset + 1], vertices[offset + 2]];
}

function getFaceNormal(vertices, face) {
	const normal = [0, 0, 0];
	for (let index = 0; index < face.length; index++) {
		const current = getMeshPoint(vertices, face[index]);
		const next = getMeshPoint(vertices, face[(index + 1) % face.length]);
		normal[0] += (current[1] - next[1]) * (current[2] + next[2]);
		normal[1] += (current[2] - next[2]) * (current[0] + next[0]);
		normal[2] += (current[0] - next[0]) * (current[1] + next[1]);
	}
	return normal;
}

function projectFacePoint(point, dropAxis) {
	if (dropAxis === 0) return [point[1], point[2]];
	if (dropAxis === 1) return [point[0], point[2]];
	return [point[0], point[1]];
}

function getProjectionDropAxis(normal) {
	const absolute = normal.map((value) => Math.abs(value));
	if (absolute[0] >= absolute[1] && absolute[0] >= absolute[2]) return 0;
	if (absolute[1] >= absolute[2]) return 1;
	return 2;
}

function signedArea2d(points) {
	let area = 0;
	for (let index = 0; index < points.length; index++) {
		const current = points[index];
		const next = points[(index + 1) % points.length];
		area += current[0] * next[1] - next[0] * current[1];
	}
	return area / 2;
}

function orient2d(a, b, c) {
	return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointInTriangle2d(point, a, b, c) {
	const epsilon = 1e-9;
	const area = orient2d(a, b, c);
	if (Math.abs(area) <= epsilon) return false;

	const edge0 = orient2d(a, b, point);
	const edge1 = orient2d(b, c, point);
	const edge2 = orient2d(c, a, point);

	if (area > 0) {
		return edge0 > epsilon && edge1 > epsilon && edge2 > epsilon;
	}
	return edge0 < -epsilon && edge1 < -epsilon && edge2 < -epsilon;
}

function triangulateFace(vertices, face) {
	if (face.length < 3) return [];
	if (face.length === 3) return [...face];

	const normal = getFaceNormal(vertices, face);
	const dropAxis = getProjectionDropAxis(normal);
	const projected = face.map((vertexIndex) =>
		projectFacePoint(getMeshPoint(vertices, vertexIndex), dropAxis),
	);
	const area = signedArea2d(projected);
	if (Math.abs(area) <= 1e-9) {
		return face.slice(1, -1).flatMap((_, index) => [
			face[0],
			face[index + 1],
			face[index + 2],
		]);
	}

	const winding = area > 0 ? 1 : -1;
	const remaining = face.map((vertexIndex, index) => ({ vertexIndex, index }));
	const triangles = [];
	let guard = 0;

	while (remaining.length > 3 && guard < face.length * face.length) {
		let clippedEar = false;

		for (let index = 0; index < remaining.length; index++) {
			const previous = remaining[(index + remaining.length - 1) % remaining.length];
			const current = remaining[index];
			const next = remaining[(index + 1) % remaining.length];
			const a = projected[previous.index];
			const b = projected[current.index];
			const c = projected[next.index];

			if (orient2d(a, b, c) * winding <= 1e-9) continue;

			const containsPoint = remaining.some((candidate, candidateIndex) => {
				if (
					candidateIndex === index ||
					candidateIndex === (index + remaining.length - 1) % remaining.length ||
					candidateIndex === (index + 1) % remaining.length
				) {
					return false;
				}
				return pointInTriangle2d(projected[candidate.index], a, b, c);
			});

			if (containsPoint) continue;

			triangles.push(previous.vertexIndex, current.vertexIndex, next.vertexIndex);
			remaining.splice(index, 1);
			clippedEar = true;
			break;
		}

		if (!clippedEar) {
			return face.slice(1, -1).flatMap((_, index) => [
				face[0],
				face[index + 1],
				face[index + 2],
			]);
		}
		guard++;
	}

	triangles.push(
		remaining[0].vertexIndex,
		remaining[1].vertexIndex,
		remaining[2].vertexIndex,
	);
	return triangles;
}

function triangulateFaces(vertices, faces) {
	const triangles = [];
	for (const face of faces) {
		triangles.push(...triangulateFace(vertices, face));
	}
	return triangles;
}

function addMeshVertex(vertices, vertexIds, point) {
	const key = point
		.map((value) => (Math.abs(value) < 1e-9 ? 0 : Number(value.toFixed(9))))
		.join(",");
	const existing = vertexIds.get(key);
	if (existing !== undefined) return existing;
	const index = vertices.length / 3;
	vertices.push(...point);
	vertexIds.set(key, index);
	return index;
}

function addMeshFace(faces, vertices, vertexIds, points) {
	faces.push(points.map((point) => addMeshVertex(vertices, vertexIds, point)));
}

function addBaseRailSegmentMesh(faces, vertices, vertexIds, x0, x1, options) {
	const start = createPicaRailProfileLoop(x0);
	const end = createPicaRailProfileLoop(x1);
	const startIds = start.map((point) => addMeshVertex(vertices, vertexIds, point));
	const endIds = end.map((point) => addMeshVertex(vertices, vertexIds, point));

	if (options.includeStartCap) faces.push(startIds);
	if (options.includeEndCap) faces.push([...endIds].reverse());

	for (let index = 0; index < startIds.length; index++) {
		const next = (index + 1) % startIds.length;
		faces.push([startIds[index], endIds[index], endIds[next], startIds[next]]);
	}
}

function addPicaRailTileMesh(faces, vertices, vertexIds, xOffset, options) {
	const tileVertices = createPicaRailTileVertices().map(([x, y, z]) => [
		x + xOffset,
		y,
		z,
	]);
	const tileVertexIds = tileVertices.map((point) =>
		addMeshVertex(vertices, vertexIds, point),
	);

	for (let index = 0; index < PICA_RAIL_TILE_FACES.length; index++) {
		if (index === PICA_RAIL_TILE_START_CAP_FACE_INDEX && !options.includeStartCap) {
			continue;
		}
		if (index === PICA_RAIL_TILE_END_CAP_FACE_INDEX && !options.includeEndCap) {
			continue;
		}
		faces.push(PICA_RAIL_TILE_FACES[index].map((vertexIndex) => tileVertexIds[vertexIndex]));
	}
}

function buildPicaRailBodyMesh(Manifold, Mesh, config) {
	const vertices = [];
	const vertexIds = new Map();
	const faces = [];
	const railLength = Math.max(0, config.railLength);
	const endExtension = Math.max(0, config.endExtension);

	if (railLength <= 0) return emptyManifold(Manifold);
	if (config.tileCount <= 0) {
		addBaseRailSegmentMesh(faces, vertices, vertexIds, 0, railLength, {
			includeStartCap: true,
			includeEndCap: true,
		});
	} else {
		if (endExtension > 0) {
			addBaseRailSegmentMesh(faces, vertices, vertexIds, 0, endExtension, {
				includeStartCap: true,
				includeEndCap: false,
			});
		}

		for (let index = 0; index < config.tileCount; index++) {
			addPicaRailTileMesh(
				faces,
				vertices,
				vertexIds,
				endExtension + index * PICA_TILE_PITCH,
				{
					includeStartCap: endExtension <= 0 && index === 0,
					includeEndCap: endExtension <= 0 && index === config.tileCount - 1,
				},
			);
		}

		if (endExtension > 0) {
			addBaseRailSegmentMesh(
				faces,
				vertices,
				vertexIds,
				endExtension + config.tileCount * PICA_TILE_PITCH,
				railLength,
				{
					includeStartCap: false,
					includeEndCap: true,
				},
			);
		}
	}

	return Manifold.ofMesh(
		new Mesh({
			numProp: 3,
			vertProperties: new Float32Array(vertices),
			triVerts: new Uint32Array(triangulateFaces(vertices, faces)),
		}),
	);
}

function buildPicaRailReferenceTile(Manifold, Mesh) {
	const vertices = createPicaRailTileVertices().flat();
	return Manifold.ofMesh(
		new Mesh({
			numProp: 3,
			vertProperties: new Float32Array(vertices),
			triVerts: new Uint32Array(triangulateFaces(vertices, PICA_RAIL_TILE_FACES)),
		}),
	);
}

function normalizeLengthConfig(config = {}) {
	const safeTileSize = clampNumber(
		config.openGridTileSizeValue ?? PICA_OPEN_GRID_TILE_SIZE_DEFAULT,
		PICA_OPEN_GRID_TILE_SIZE_MIN,
		PICA_OPEN_GRID_TILE_SIZE_MAX,
		PICA_OPEN_GRID_TILE_SIZE_DEFAULT,
	);
	const safeTileLength = clampInteger(
		config.openGridTileLength ?? PICA_OPEN_GRID_LENGTH_MIN,
		PICA_OPEN_GRID_LENGTH_MIN,
		PICA_OPEN_GRID_LENGTH_MAX,
		PICA_OPEN_GRID_LENGTH_MIN,
	);
	const targetLength = safeTileSize * safeTileLength;
	const tileCount = Math.max(0, Math.floor(targetLength / PICA_TILE_PITCH));
	const extendEnds = config.extendEnds ?? true;
	const endExtension = extendEnds
		? (targetLength - tileCount * PICA_TILE_PITCH) / 2
		: 0;
	const railLength = tileCount * PICA_TILE_PITCH + endExtension * 2;
	const railX = Math.max(0, (targetLength - railLength) / 2);

	return {
		tileSize: safeTileSize,
		tileLength: safeTileLength,
		targetLength,
		extendEnds,
		tileCount,
		endExtension,
		railX,
		railLength: Math.max(0, railLength),
		screwHoleTiles: sanitizeScrewHoleTiles(config.screwHoleTiles, safeTileLength),
		screwHoleSegments: clampInteger(
			config.screwHoleSegmentsValue ?? PICA_SCREW_HOLE_SEGMENTS_DEFAULT,
			PICA_SCREW_HOLE_SEGMENTS_MIN,
			PICA_SCREW_HOLE_SEGMENTS_MAX,
			PICA_SCREW_HOLE_SEGMENTS_DEFAULT,
		),
	};
}

function sanitizeScrewHoleTiles(raw, tileLength) {
	if (!Array.isArray(raw) || tileLength <= 0) return [];
	return [
		...new Set(
			raw
				.map((value) => Math.round(Number(value)))
				.filter((value) =>
					Number.isFinite(value) && value >= 0 && value < tileLength,
				),
		),
	].sort((a, b) => a - b);
}

function buildPicaRailBaseSegment(CrossSection, config) {
	const railLength = Math.max(0, config.railLength);
	const profile = createPicaRailProfile(CrossSection);

	return profile
		.extrude(railLength, 0, 0, [1, 1], false)
		.warp((vert) => {
			const [u, v, w] = vert;
			vert[0] = w;
			vert[1] = u;
			vert[2] = v;
		});
}

function buildPicaRailBody(Manifold, Mesh, CrossSection, config) {
	return buildPicaRailBodyMesh(Manifold, Mesh, config);
}

function buildPicaRailScrewHoleNegative(Manifold, config) {
	const booleanOverlap = 0.2;
	const segments = config.screwHoleSegments;
	const lowerHeight = PICA_SCREW_HOLE_CONE_BOTTOM_Z + booleanOverlap;
	const coneHeight =
		PICA_SCREW_HOLE_CONE_TOP_Z - PICA_SCREW_HOLE_CONE_BOTTOM_Z;
	const upperHeight =
		PICA_RAIL_HEIGHT - PICA_SCREW_HOLE_CONE_TOP_Z + booleanOverlap;

	return unionAll(Manifold, [
		Manifold.cylinder(
			lowerHeight,
			PICA_SCREW_HOLE_RADIUS,
			-1,
			segments,
		).translate(0, 0, -booleanOverlap),
		Manifold.cylinder(
			coneHeight,
			PICA_SCREW_HOLE_CONE_BOTTOM_RADIUS,
			PICA_SCREW_HOLE_HEAD_RADIUS,
			segments,
		).translate(0, 0, PICA_SCREW_HOLE_CONE_BOTTOM_Z),
		Manifold.cylinder(
			upperHeight,
			PICA_SCREW_HOLE_HEAD_RADIUS,
			-1,
			segments,
		).translate(0, 0, PICA_SCREW_HOLE_CONE_TOP_Z),
	]);
}

function buildPicaRailScrewHoles(Manifold, config) {
	if (!config.screwHoleTiles.length || config.railLength <= 0) {
		return emptyManifold(Manifold);
	}
	const negative = buildPicaRailScrewHoleNegative(Manifold, config);
	const holes = config.screwHoleTiles.map((tileIndex) =>
		negative.translate(
			tileIndex * config.tileSize + config.tileSize / 2,
			0,
			0,
		),
	);
	return unionAll(Manifold, holes);
}

async function buildPicaRailModelFromConfig(config = {}) {
	const { Manifold, Mesh, CrossSection } = await getManifoldApi();
	const settings = normalizeLengthConfig(config);
	const railLength = Math.max(0, settings.railLength);
	const body = buildPicaRailBody(Manifold, Mesh, CrossSection, {
		...settings,
		railLength,
	}).translate(settings.railX, 0, 0);
	const screwHoles = buildPicaRailScrewHoles(Manifold, settings);
	return body.subtract(screwHoles);
}

export function getPicaRailConfigSummary(config = {}) {
	return normalizeLengthConfig(config);
}

export async function warmPicaRailGeometry() {
	await warmManifoldRuntime();
}

export async function renderPicaRailPreviewMesh(config = {}) {
	const model = await buildPicaRailModelFromConfig(config);
	return {
		mesh: buildPreviewMeshFromModels([model]),
	};
}

export async function renderPicaRailExport(config = {}, format = "stl-binary") {
	const model = await buildPicaRailModelFromConfig(config);
	if (format === "3mf") {
		const doc = await manifoldToGLTFDoc(model);
		const buffer = await export3mfToArrayBuffer(doc);
		return {
			bytes: new Uint8Array(buffer),
			mimeType: "model/3mf",
			extension: "3mf",
		};
	}

	if (format === "stl-ascii") {
		return {
			bytes: buildAsciiStlFromModels([model]),
			mimeType: "model/stl",
			extension: "stl",
		};
	}

	return {
		bytes: buildBinaryStlFromModels([model]),
		mimeType: "model/stl",
		extension: "stl",
	};
}
