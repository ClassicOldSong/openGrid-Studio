import ManifoldModule from "manifold-3d/manifold";
import { manifoldToGLTFDoc } from "manifold-3d/lib/scene-builder";
import { toArrayBuffer as export3mfToArrayBuffer } from "manifold-3d/lib/export-3mf";
import { buildPlacementData } from "./placement-data.js";

const OUTSIDE_EXTRUSION = 0.8;
const INSIDE_GRID_TOP_CHAMFER = 0.4;
const INSIDE_GRID_MIDDLE_CHAMFER = 1;
const TOP_CAPTURE_INITIAL_INSET = 2.4;
const CORNER_SQUARE_THICKNESS = 2.6;
const INTERSECTION_DISTANCE = 4.2;
const TILE_INNER_SIZE_DIFFERENCE = 3;
const CONNECTOR_CUTOUT_RADIUS = 2.6;
const CONNECTOR_CUTOUT_SEPARATION = 2.5;
const CONNECTOR_CUTOUT_HEIGHT = 2.4;
const CONNECTOR_STEM_ROUNDING = 0.25;
const CONNECTOR_SHOULDER_FILLET_RADIUS = 0.5;
const CONNECTOR_INNER_BLEND_RADIUS = Math.sqrt(125 / 16);
const LITE_CUTOUT_DISTANCE_FROM_TOP = 1;
const HEAVY_JOIN_SLICE_EPSILON = 0.01;

let manifoldPromise = null;
const shapeCache = new Map();

function cacheKey(name, parts) {
	return `${name}:${parts.join("|")}`;
}

function getCachedShape(key, factory) {
	if (!shapeCache.has(key)) shapeCache.set(key, factory());
	return shapeCache.get(key);
}

async function getManifoldApi() {
	if (!manifoldPromise) {
		manifoldPromise = ManifoldModule().then((module) => {
			module.setup();
			return module;
		});
	}
	return await manifoldPromise;
}

export async function warmDirectGeometry() {
	await getManifoldApi();
}

function emptyManifold(Manifold) {
	return Manifold.hull([]);
}

function unionAll(Manifold, items) {
	if (items.length === 0) return emptyManifold(Manifold);
	if (items.length === 1) return items[0];
	return Manifold.union(items);
}

function differenceAll(Manifold, base, cuts) {
	if (!cuts || cuts.isEmpty()) return base;
	return base.subtract(cuts);
}

function range(n) {
	return Array.from({ length: n }, (_, i) => i);
}

function clampPositive(value, fallback = 0.01) {
	return value > 0 ? value : fallback;
}

function countersinkHeight(enabled, degree, headDiameter, screwDiameter) {
	if (!enabled) return 0.01;
	const radiusDelta = headDiameter / 2 - screwDiameter / 2;
	if (radiusDelta <= 0) return 0.01;
	return Math.tan(((180 - degree) * Math.PI) / 360) * radiusDelta - 0.01;
}

function circleIntersections(centerA, radiusA, centerB, radiusB) {
	const dx = centerB[0] - centerA[0];
	const dy = centerB[1] - centerA[1];
	const distance = Math.hypot(dx, dy);
	const along =
		(radiusA ** 2 - radiusB ** 2 + distance ** 2) / (2 * distance);
	const height = Math.sqrt(Math.max(0, radiusA ** 2 - along ** 2));
	const midX = centerA[0] + (along * dx) / distance;
	const midY = centerA[1] + (along * dy) / distance;
	return [
		[midX + (-dy * height) / distance, midY + (dx * height) / distance],
		[midX - (-dy * height) / distance, midY - (dx * height) / distance],
	];
}

function angleOfPoint(center, point) {
	return Math.atan2(point[1] - center[1], point[0] - center[0]);
}

function sampleArc(center, radius, startAngle, endAngle, steps) {
	const points = [];
	for (let i = 1; i <= steps; i++) {
		const t = i / steps;
		const angle = startAngle + (endAngle - startAngle) * t;
		points.push([
			center[0] + radius * Math.cos(angle),
			center[1] + radius * Math.sin(angle),
		]);
	}
	return points;
}

function boardProfile(baseThickness, boardType, tileSize) {
	const tileInnerSize = tileSize - TILE_INNER_SIZE_DIFFERENCE;
	const insideExtrusion = (tileSize - tileInnerSize) / 2 - OUTSIDE_EXTRUSION;

	if (boardType === "Heavy") {
		return [
			[0, 0],
			[OUTSIDE_EXTRUSION, 0],
			[OUTSIDE_EXTRUSION, baseThickness - TOP_CAPTURE_INITIAL_INSET],
			[
				OUTSIDE_EXTRUSION + insideExtrusion,
				baseThickness - TOP_CAPTURE_INITIAL_INSET + INSIDE_GRID_MIDDLE_CHAMFER,
			],
			[
				OUTSIDE_EXTRUSION + insideExtrusion,
				baseThickness - INSIDE_GRID_TOP_CHAMFER,
			],
			[
				OUTSIDE_EXTRUSION + insideExtrusion - INSIDE_GRID_TOP_CHAMFER,
				baseThickness,
			],
			[0, baseThickness],
		];
	}

	return [
		[0, 0],
		[OUTSIDE_EXTRUSION + insideExtrusion - INSIDE_GRID_TOP_CHAMFER, 0],
		[OUTSIDE_EXTRUSION + insideExtrusion, INSIDE_GRID_TOP_CHAMFER],
		[
			OUTSIDE_EXTRUSION + insideExtrusion,
			TOP_CAPTURE_INITIAL_INSET - INSIDE_GRID_MIDDLE_CHAMFER,
		],
		[OUTSIDE_EXTRUSION, TOP_CAPTURE_INITIAL_INSET],
		[OUTSIDE_EXTRUSION, baseThickness - TOP_CAPTURE_INITIAL_INSET],
		[
			OUTSIDE_EXTRUSION + insideExtrusion,
			baseThickness - TOP_CAPTURE_INITIAL_INSET + INSIDE_GRID_MIDDLE_CHAMFER,
		],
		[
			OUTSIDE_EXTRUSION + insideExtrusion,
			baseThickness - INSIDE_GRID_TOP_CHAMFER,
		],
		[
			OUTSIDE_EXTRUSION + insideExtrusion - INSIDE_GRID_TOP_CHAMFER,
			baseThickness,
		],
		[0, baseThickness],
	];
}

function cornerProfile(baseThickness) {
	const cornerChamfer = TOP_CAPTURE_INITIAL_INSET - INSIDE_GRID_MIDDLE_CHAMFER;
	const calculatedCornerChamfer = Math.sqrt(INTERSECTION_DISTANCE ** 2 / 2);
	const cornerOffset = calculatedCornerChamfer + CORNER_SQUARE_THICKNESS;

	return {
		cornerOffset,
		profile: [
			[0, 0],
			[cornerOffset - cornerChamfer, 0],
			[cornerOffset, cornerChamfer],
			[cornerOffset, baseThickness - cornerChamfer],
			[cornerOffset - cornerChamfer, baseThickness],
			[0, baseThickness],
		],
	};
}

function buildTile(Manifold, CrossSection, tileSize, baseThickness, boardType) {
	const key = cacheKey("tile", [tileSize, baseThickness, boardType]);
	return getCachedShape(key, () => {
		const sideProfile = new CrossSection([
			boardProfile(baseThickness, boardType, tileSize),
		]);
		const side = sideProfile
			.extrude(tileSize, 0, 0, [1, 1], true)
			.warp((vert) => {
				const [u, v, w] = vert;
				vert[0] = w;
				vert[1] = -tileSize / 2 + u;
				vert[2] = v;
			});

		const { cornerOffset, profile } = cornerProfile(baseThickness);
		const diagonal = 1 / Math.sqrt(2);
		const corner = new CrossSection([profile])
			.extrude(cornerOffset * 2, 0, 0, [1, 1], true)
			.warp((vert) => {
				const [u, v, w] = vert;
				vert[0] = -tileSize / 2 + (u + w) * diagonal;
				vert[1] = -tileSize / 2 + (u - w) * diagonal;
				vert[2] = v;
			});

		const pieces = [
			side,
			side.rotate(0, 0, 90),
			side.rotate(0, 0, 180),
			side.rotate(0, 0, 270),
			corner,
			corner.rotate(0, 0, 90),
			corner.rotate(0, 0, 180),
			corner.rotate(0, 0, 270),
		];

		const bounds = Manifold.cube(
			[tileSize, tileSize, baseThickness],
			true,
		).translate(0, 0, baseThickness / 2);
		return unionAll(Manifold, pieces).intersect(bounds);
	});
}

function buildNodeFill(Manifold, baseThickness) {
	const key = cacheKey("node-fill", [baseThickness]);
	return getCachedShape(key, () => {
		const nodeFillWidth =
			Math.sqrt(CORNER_SQUARE_THICKNESS ** 2 * 2) + INTERSECTION_DISTANCE;
		return Manifold.cube([nodeFillWidth, nodeFillWidth, baseThickness], true)
			.rotate(0, 0, 45)
			.translate(0, 0, baseThickness / 2);
	});
}

function buildChamferCut(Manifold, baseThickness) {
	const key = cacheKey("chamfer-cut", [baseThickness]);
	return getCachedShape(key, () => {
		const tileChamfer = Math.sqrt(INTERSECTION_DISTANCE ** 2 * 2);
		const height = baseThickness + 0.02;
		return Manifold.cube([tileChamfer, tileChamfer, height], true)
			.rotate(0, 0, 45)
			.translate(0, 0, height / 2 - 0.01);
	});
}

function buildHoleCut(Manifold, config, baseThickness, boardType) {
	const key = cacheKey("hole-cut", [
		baseThickness,
		boardType,
		config.circleSegmentsValue,
		config.screwDiameterValue,
		config.screwHeadDiameterValue,
		config.screwHeadInsetValue,
		config.screwHeadIsCountersunk,
		config.screwHeadCountersunkDegreeValue,
		config.backsideScrewHole,
		config.backsideScrewHeadDiameterShrinkValue,
		config.backsideScrewHeadInsetValue,
		config.backsideScrewHeadIsCountersunk,
		config.backsideScrewHeadCountersunkDegreeValue,
	]);

	return getCachedShape(key, () => {
		const parts = [];
		const frontHeadDiameter = config.screwHeadDiameterValue;
		const backsideEnabled = config.backsideScrewHole && boardType !== "Heavy";
		const backsideHeadDiameter = Math.max(
			config.screwDiameterValue,
			config.screwHeadDiameterValue -
				config.backsideScrewHeadDiameterShrinkValue,
		);
		const frontCountersink = countersinkHeight(
			config.screwHeadIsCountersunk,
			config.screwHeadCountersunkDegreeValue,
			frontHeadDiameter,
			config.screwDiameterValue,
		);
		const backsideCountersink = countersinkHeight(
			config.backsideScrewHeadIsCountersunk,
			config.backsideScrewHeadCountersunkDegreeValue,
			backsideHeadDiameter,
			config.screwDiameterValue,
		);

		const throughHeight = baseThickness + 0.02;
		const frontHeadHeight = clampPositive(config.screwHeadInsetValue);
		const backsideHeadHeight = clampPositive(
			config.backsideScrewHeadInsetValue,
		);
		const frontHeadZ = baseThickness - frontHeadHeight;
		const frontConeZ = frontHeadZ - frontCountersink;
		const backsideHeadZ = -0.01;
		const backsideConeZ = backsideHeadZ + backsideHeadHeight;

		parts.push(
			Manifold.cylinder(
				throughHeight,
				config.screwDiameterValue / 2,
				-1,
				config.circleSegmentsValue,
			).translate(0, 0, -0.01),
			Manifold.cylinder(
				frontHeadHeight + 0.01,
				frontHeadDiameter / 2,
				-1,
				config.circleSegmentsValue,
			).translate(0, 0, frontHeadZ),
		);

		if (frontCountersink > 0) {
			parts.push(
				Manifold.cylinder(
					frontCountersink,
					config.screwDiameterValue / 2,
					frontHeadDiameter / 2,
					config.circleSegmentsValue,
				).translate(0, 0, frontConeZ),
			);
		}

		if (backsideEnabled) {
			parts.push(
				Manifold.cylinder(
					backsideHeadHeight + 0.01,
					backsideHeadDiameter / 2,
					-1,
					config.circleSegmentsValue,
				).translate(0, 0, backsideHeadZ),
			);

			if (backsideCountersink > 0) {
				parts.push(
					Manifold.cylinder(
						backsideCountersink,
						backsideHeadDiameter / 2,
						config.screwDiameterValue / 2,
						config.circleSegmentsValue,
					).translate(0, 0, backsideConeZ),
				);
			}
		}

		return unionAll(Manifold, parts);
	});
}

function buildConnectorCut(Manifold, CrossSection, circleSegments) {
	const key = cacheKey("connector-cut", [circleSegments]);
	return getCachedShape(key, () => {
		const outerCenter = [CONNECTOR_CUTOUT_SEPARATION, 0];
		const innerBlendCenterUpper = [
			0,
			CONNECTOR_CUTOUT_RADIUS + CONNECTOR_CUTOUT_SEPARATION,
		];
		const innerBlendCenterLower = [
			0,
			-(CONNECTOR_CUTOUT_RADIUS + CONNECTOR_CUTOUT_SEPARATION),
		];
		const shoulderInset = Math.sqrt(
			(CONNECTOR_INNER_BLEND_RADIUS + CONNECTOR_SHOULDER_FILLET_RADIUS) ** 2 -
				(
					CONNECTOR_CUTOUT_SEPARATION + CONNECTOR_SHOULDER_FILLET_RADIUS
				) ** 2,
		);
		const shoulderCenterUpper = [
			shoulderInset,
			CONNECTOR_CUTOUT_RADIUS - CONNECTOR_SHOULDER_FILLET_RADIUS,
		];
		const shoulderCenterLower = [
			shoulderInset,
			-(CONNECTOR_CUTOUT_RADIUS - CONNECTOR_SHOULDER_FILLET_RADIUS),
		];
		const sideHalfWidth =
			CONNECTOR_CUTOUT_RADIUS + CONNECTOR_CUTOUT_SEPARATION -
			Math.sqrt(
				(CONNECTOR_INNER_BLEND_RADIUS - CONNECTOR_STEM_ROUNDING) ** 2 -
					CONNECTOR_STEM_ROUNDING ** 2,
			);
		const sideNoseCenterUpper = [CONNECTOR_STEM_ROUNDING, sideHalfWidth];
		const sideNoseCenterLower = [CONNECTOR_STEM_ROUNDING, -sideHalfWidth];

		const upperNoseJoin = circleIntersections(
			sideNoseCenterUpper,
			CONNECTOR_STEM_ROUNDING,
			innerBlendCenterUpper,
			CONNECTOR_INNER_BLEND_RADIUS,
		).sort((a, b) => b[1] - a[1])[0];
		const upperShoulderJoin = circleIntersections(
			innerBlendCenterUpper,
			CONNECTOR_INNER_BLEND_RADIUS,
			shoulderCenterUpper,
			CONNECTOR_SHOULDER_FILLET_RADIUS,
		).sort((a, b) => b[1] - a[1])[0];
		const lowerShoulderJoin = [upperShoulderJoin[0], -upperShoulderJoin[1]];
		const lowerNoseJoin = [upperNoseJoin[0], -upperNoseJoin[1]];

		const noseSteps = Math.max(6, Math.ceil(circleSegments / 8));
		const blendSteps = Math.max(10, Math.ceil(circleSegments / 6));
		const outerSteps = Math.max(16, Math.ceil(circleSegments / 2));

		const upperNoseEndAngle = angleOfPoint(sideNoseCenterUpper, upperNoseJoin);
		const points = [
			[0, sideHalfWidth],
			...sampleArc(
				sideNoseCenterUpper,
				CONNECTOR_STEM_ROUNDING,
				Math.PI,
				upperNoseEndAngle < 0 ? upperNoseEndAngle + Math.PI * 2 : upperNoseEndAngle,
				noseSteps,
			),
			...sampleArc(
				innerBlendCenterUpper,
				CONNECTOR_INNER_BLEND_RADIUS,
				angleOfPoint(innerBlendCenterUpper, upperNoseJoin),
				angleOfPoint(innerBlendCenterUpper, upperShoulderJoin),
				blendSteps,
			),
			...sampleArc(
				shoulderCenterUpper,
				CONNECTOR_SHOULDER_FILLET_RADIUS,
				angleOfPoint(shoulderCenterUpper, upperShoulderJoin),
				Math.PI / 2,
				noseSteps,
			),
			[CONNECTOR_CUTOUT_SEPARATION, CONNECTOR_CUTOUT_RADIUS],
			...sampleArc(
				outerCenter,
				CONNECTOR_CUTOUT_RADIUS,
				Math.PI / 2,
				-Math.PI / 2,
				outerSteps,
			),
			[shoulderInset, -CONNECTOR_CUTOUT_RADIUS],
			...sampleArc(
				shoulderCenterLower,
				CONNECTOR_SHOULDER_FILLET_RADIUS,
				-Math.PI / 2,
				angleOfPoint(shoulderCenterLower, lowerShoulderJoin),
				noseSteps,
			),
			...sampleArc(
				innerBlendCenterLower,
				CONNECTOR_INNER_BLEND_RADIUS,
				angleOfPoint(innerBlendCenterLower, lowerShoulderJoin),
				angleOfPoint(innerBlendCenterLower, lowerNoseJoin),
				blendSteps,
			),
			...sampleArc(
				sideNoseCenterLower,
				CONNECTOR_STEM_ROUNDING,
				angleOfPoint(sideNoseCenterLower, lowerNoseJoin),
				Math.PI,
				noseSteps,
			),
		];
		const profile = new CrossSection([[...points].reverse()]);

		return profile.extrude(CONNECTOR_CUTOUT_HEIGHT, 0, 0, [1, 1], true);
	});
}

function buildBoardCuts(
	Manifold,
	CrossSection,
	placements,
	config,
	boardType,
	baseThickness,
	includeConnectors,
) {
	const cutParts = [];

	if (placements.chamferNodes.length > 0) {
		const chamferCut = buildChamferCut(Manifold, baseThickness);
		for (const [x, y] of placements.chamferNodes) {
			cutParts.push(chamferCut.translate(x, y, 0));
		}
	}

	if (placements.holeNodes.length > 0) {
		const holeCut = buildHoleCut(Manifold, config, baseThickness, boardType);
		for (const [x, y] of placements.holeNodes) {
			cutParts.push(holeCut.translate(x, y, 0));
		}
	}

	if (includeConnectors && placements.connectorNodes.length > 0) {
		const connectorCut = buildConnectorCut(
			Manifold,
			CrossSection,
			config.circleSegmentsValue,
		);
		const connectorZ =
			boardType === "Lite"
				? baseThickness -
					CONNECTOR_CUTOUT_HEIGHT / 2 -
					LITE_CUTOUT_DISTANCE_FROM_TOP
				: baseThickness / 2;

		for (const [x, y, rotation] of placements.connectorNodes) {
			cutParts.push(
				connectorCut.rotate(0, 0, rotation).translate(x, y, connectorZ),
			);
		}
	}

	return unionAll(Manifold, cutParts);
}

function buildBoardCore(
	Manifold,
	CrossSection,
	config,
	boardType,
	baseThickness,
	includeConnectors = true,
) {
	const placements = buildPlacementData(
		config.exportGrid,
		config.tileSizeValue,
		boardType,
	);
	const tile = buildTile(
		Manifold,
		CrossSection,
		config.tileSizeValue,
		baseThickness,
		boardType,
	);
	const nodeFill = buildNodeFill(Manifold, baseThickness);

	const solids = [];
	for (const [x, y] of placements.tileCenters) {
		solids.push(tile.translate(x, y, 0));
	}
	for (const [x, y] of placements.fillNodes) {
		solids.push(nodeFill.translate(x, y, 0));
	}

	const body = unionAll(Manifold, solids);
	const cuts = buildBoardCuts(
		Manifold,
		CrossSection,
		placements,
		config,
		boardType,
		baseThickness,
		includeConnectors,
	);
	return {
		board: differenceAll(Manifold, body, cuts),
		placements,
	};
}

function buildLiteBoard(fullLiteBoard, tileThickness, liteThickness, flip) {
	const cutHeight = tileThickness - liteThickness;
	let lite = fullLiteBoard
		.trimByPlane([0, 0, 1], cutHeight)
		.translate(0, 0, -cutHeight);
	if (flip) lite = lite.mirror([0, 0, 1]).translate(0, 0, liteThickness);
	return lite;
}

function buildAdhesiveBase(Manifold, CrossSection, config, placements) {
	const thickness = config.adhesiveBaseThicknessValue;
	const slab = Manifold.cube(
		[
			placements.boardW * config.tileSizeValue,
			placements.boardH * config.tileSizeValue,
			thickness,
		],
		true,
	).translate(0, 0, thickness / 2);

	const cuts = buildBoardCuts(
		Manifold,
		CrossSection,
		placements,
		config,
		"Lite",
		thickness,
		true,
	);
	return differenceAll(Manifold, slab, cuts);
}

function buildHeavyBoard(
	Manifold,
	heavyFaceBoard,
	heavyMiddleBoard,
	tileThickness,
	gap,
) {
	const top = heavyFaceBoard.translate(0, 0, gap / 2);
	const middle = heavyMiddleBoard
		.slice(HEAVY_JOIN_SLICE_EPSILON)
		.extrude(gap)
		.translate(0, 0, -gap / 2);
	const bottom = heavyFaceBoard.mirror([0, 0, 1]).translate(0, 0, -gap / 2);
	return unionAll(Manifold, [top, middle, bottom]).translate(
		0,
		0,
		tileThickness + gap / 2,
	);
}

function getTriangleMesh(manifold) {
	const mesh = manifold.getMesh();
	const triangleCount = mesh.triVerts.length / 3;
	return { mesh, triangleCount };
}

function getTriangleGeometry(mesh, triangleIndex) {
	const i0 = mesh.triVerts[triangleIndex * 3];
	const i1 = mesh.triVerts[triangleIndex * 3 + 1];
	const i2 = mesh.triVerts[triangleIndex * 3 + 2];

	const p0 = mesh.position(i0);
	const p1 = mesh.position(i1);
	const p2 = mesh.position(i2);

	const ux = p1[0] - p0[0];
	const uy = p1[1] - p0[1];
	const uz = p1[2] - p0[2];
	const vx = p2[0] - p0[0];
	const vy = p2[1] - p0[1];
	const vz = p2[2] - p0[2];

	let nx = uy * vz - uz * vy;
	let ny = uz * vx - ux * vz;
	let nz = ux * vy - uy * vx;
	const length = Math.hypot(nx, ny, nz) || 1;
	nx /= length;
	ny /= length;
	nz /= length;

	return { p0, p1, p2, normal: [nx, ny, nz] };
}

function buildBinaryStl(manifold) {
	const { mesh, triangleCount } = getTriangleMesh(manifold);
	const buffer = new ArrayBuffer(84 + triangleCount * 50);
	const view = new DataView(buffer);

	view.setUint32(80, triangleCount, true);

	let offset = 84;
	for (let i = 0; i < triangleCount; i++) {
		const { p0, p1, p2, normal } = getTriangleGeometry(mesh, i);

		view.setFloat32(offset, normal[0], true);
		view.setFloat32(offset + 4, normal[1], true);
		view.setFloat32(offset + 8, normal[2], true);
		offset += 12;

		for (const point of [p0, p1, p2]) {
			view.setFloat32(offset, point[0], true);
			view.setFloat32(offset + 4, point[1], true);
			view.setFloat32(offset + 8, point[2], true);
			offset += 12;
		}

		view.setUint16(offset, 0, true);
		offset += 2;
	}

	return new Uint8Array(buffer);
}

function formatAsciiStlNumber(value) {
	if (Math.abs(value) < 1e-9) return "0";
	return Number(value.toFixed(6)).toString();
}

function buildAsciiStl(manifold) {
	const { mesh, triangleCount } = getTriangleMesh(manifold);
	const lines = ["solid opengrid_design"];

	for (let i = 0; i < triangleCount; i++) {
		const { p0, p1, p2, normal } = getTriangleGeometry(mesh, i);
		lines.push(
			`  facet normal ${formatAsciiStlNumber(normal[0])} ${formatAsciiStlNumber(normal[1])} ${formatAsciiStlNumber(normal[2])}`,
			"    outer loop",
			`      vertex ${formatAsciiStlNumber(p0[0])} ${formatAsciiStlNumber(p0[1])} ${formatAsciiStlNumber(p0[2])}`,
			`      vertex ${formatAsciiStlNumber(p1[0])} ${formatAsciiStlNumber(p1[1])} ${formatAsciiStlNumber(p1[2])}`,
			`      vertex ${formatAsciiStlNumber(p2[0])} ${formatAsciiStlNumber(p2[1])} ${formatAsciiStlNumber(p2[2])}`,
			"    endloop",
			"  endfacet",
		);
	}

	lines.push("endsolid opengrid_design");
	return new TextEncoder().encode(lines.join("\n"));
}

function buildPreviewMesh(manifold) {
	const mesh = manifold.getMesh();
	const vertexCount = mesh.vertProperties.length / mesh.numProp;
	const positions = new Float32Array(vertexCount * 3);

	for (let i = 0; i < vertexCount; i++) {
		const base = i * mesh.numProp;
		const target = i * 3;
		positions[target] = mesh.vertProperties[base];
		positions[target + 1] = mesh.vertProperties[base + 1];
		positions[target + 2] = mesh.vertProperties[base + 2];
	}

	return {
		positions,
		indices: new Uint32Array(mesh.triVerts),
		bounds: manifold.boundingBox(),
	};
}

async function buildDirectModel(config) {
	const { Manifold, CrossSection } = await getManifoldApi();
	const adjustedStackCount = config.addAdhesiveBase
		? 1
		: config.stackCountValue;
	const adjustedInterfaceThickness =
		config.stackingMethod === "Interface Layer"
			? config.interfaceThicknessValue
			: 0;

	let model = null;

	if (config.fullOrLite === "Full") {
		const { board: fullBoard } = buildBoardCore(
			Manifold,
			CrossSection,
			config,
			"Full",
			config.tileThicknessValue,
			true,
		);

		if (adjustedStackCount === 1) {
			model = fullBoard;
		} else {
			const spacing =
				config.tileThicknessValue +
				adjustedInterfaceThickness +
				2 * config.interfaceSeparationValue;
			const mirroredBoard = fullBoard
				.mirror([0, 0, 1])
				.translate(0, 0, config.tileThicknessValue);
			const parts = range(adjustedStackCount).map((i) =>
				mirroredBoard.translate(0, 0, i * spacing),
			);

			if (
				config.stackingMethod === "Interface Layer" &&
				config.interfaceThicknessValue > 0 &&
				adjustedStackCount > 1
			) {
				const interfaceLayer = fullBoard
					.slice(0)
					.extrude(config.interfaceThicknessValue);
				for (let i = 0; i < adjustedStackCount - 1; i++) {
					parts.push(
						interfaceLayer.translate(
							0,
							0,
							config.tileThicknessValue +
								config.interfaceSeparationValue +
								i * spacing,
						),
					);
				}
			}

			model = unionAll(Manifold, parts);
		}
	} else if (config.fullOrLite === "Lite") {
		const { board: fullLiteBoard, placements } = buildBoardCore(
			Manifold,
			CrossSection,
			config,
			"Lite",
			config.tileThicknessValue,
			true,
		);
		const liteBoard = buildLiteBoard(
			fullLiteBoard,
			config.tileThicknessValue,
			config.liteTileThicknessValue,
			false,
		);

		if (adjustedStackCount === 1) {
			if (config.addAdhesiveBase) {
				const adhesiveBase = buildAdhesiveBase(
					Manifold,
					CrossSection,
					config,
					placements,
				);
				model = unionAll(Manifold, [
					adhesiveBase,
					liteBoard.translate(0, 0, config.adhesiveBaseThicknessValue),
				]);
			} else {
				model = liteBoard;
			}
		} else {
			const flippedLiteBoard = buildLiteBoard(
				fullLiteBoard,
				config.tileThicknessValue,
				config.liteTileThicknessValue,
				true,
			);
			const spacing =
				config.liteTileThicknessValue +
				adjustedInterfaceThickness +
				2 * config.interfaceSeparationValue;
			const parts = range(adjustedStackCount).map((i) => {
				const layer = i % 2 === 0 ? flippedLiteBoard : liteBoard;
				return layer.translate(0, 0, i * spacing);
			});

			if (
				config.stackingMethod === "Interface Layer" &&
				config.interfaceThicknessValue > 0 &&
				adjustedStackCount > 1
			) {
				const cutPlane =
					config.tileThicknessValue - config.liteTileThicknessValue;
				const interfaceLayer = fullLiteBoard
					.slice(cutPlane)
					.extrude(config.interfaceThicknessValue);
				for (let i = 0; i < adjustedStackCount - 1; i++) {
					parts.push(
						interfaceLayer.translate(
							0,
							0,
							config.liteTileThicknessValue +
								config.interfaceSeparationValue +
								i * spacing,
						),
					);
				}
			}

			model = unionAll(Manifold, parts);
		}
	} else if (config.fullOrLite === "Heavy") {
		const { board: heavyFaceBoard } = buildBoardCore(
			Manifold,
			CrossSection,
			config,
			"Heavy",
			config.tileThicknessValue,
			true,
		);
		const { board: heavyMiddleBoard } = buildBoardCore(
			Manifold,
			CrossSection,
			config,
			"Heavy",
			config.tileThicknessValue,
			false,
		);
		const heavyBoard = buildHeavyBoard(
			Manifold,
			heavyFaceBoard,
			heavyMiddleBoard,
			config.tileThicknessValue,
			config.heavyTileGapValue,
		);

		if (adjustedStackCount === 1) {
			model = heavyBoard;
		} else {
			const spacing =
				config.heavyTileThicknessValue +
				adjustedInterfaceThickness +
				2 * config.interfaceSeparationValue;
			const parts = range(adjustedStackCount).map((i) =>
				heavyBoard.translate(0, 0, i * spacing),
			);

			if (
				config.stackingMethod === "Interface Layer" &&
				config.interfaceThicknessValue > 0 &&
				adjustedStackCount > 1
			) {
				const interfaceLayer = heavyBoard
					.slice(0)
					.extrude(config.interfaceThicknessValue);
				for (let i = 0; i < adjustedStackCount - 1; i++) {
					parts.push(
						interfaceLayer.translate(
							0,
							0,
							config.heavyTileThicknessValue +
								config.interfaceSeparationValue +
								i * spacing,
						),
					);
				}
			}

			model = unionAll(Manifold, parts);
		}
	} else {
		throw new Error(`Unsupported board mode: ${config.fullOrLite}`);
	}

	if (!model || model.isEmpty()) {
		throw new Error("Direct export produced empty geometry.");
	}

	return model;
}

export async function renderDirectPreviewMesh(config) {
	const model = await buildDirectModel(config);
	return {
		mesh: buildPreviewMesh(model),
		logs: [`Direct preview: Manifold (${config.fullOrLite})`],
	};
}

export async function renderDirectExport(config, format = "stl-binary") {
	const model = await buildDirectModel(config);

	if (format === "3mf") {
		const doc = await manifoldToGLTFDoc(model);
		const buffer = await export3mfToArrayBuffer(doc);
		return {
			bytes: new Uint8Array(buffer),
			mimeType: "model/3mf",
			extension: "3mf",
			logs: [`Direct export: 3MF (${config.fullOrLite})`],
		};
	}

	if (format === "stl-ascii") {
		return {
			bytes: buildAsciiStl(model),
			mimeType: "model/stl",
			extension: "stl",
			logs: [`Direct export: ASCII STL (${config.fullOrLite})`],
		};
	}

	return {
		bytes: buildBinaryStl(model),
		mimeType: "model/stl",
		extension: "stl",
		logs: [`Direct export: Binary STL (${config.fullOrLite})`],
	};
}
