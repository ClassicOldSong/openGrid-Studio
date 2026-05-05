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
	PICA_RAIL_SHOULDER_HEIGHT,
	PICA_RAIL_TOP_FLAT_WIDTH,
	PICA_RAIL_TOP_WIDTH,
	PICA_SLOT_DEPTH,
	PICA_TILE_OFFSET,
	PICA_TILE_PITCH,
	PICA_TILE_SLOT_WIDTH,
} from "./constants.js";
import { getManifoldApi, warmManifoldRuntime } from "../shared/geometry/manifold-runtime.js";

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
			[shoulderHalfWidth, PICA_RAIL_SHOULDER_HEIGHT],
			[topFlatHalfWidth, PICA_RAIL_HEIGHT],
			[-topFlatHalfWidth, PICA_RAIL_HEIGHT],
			[-shoulderHalfWidth, PICA_RAIL_SHOULDER_HEIGHT],
			[-baseHalfWidth, PICA_RAIL_BODY_HEIGHT],
		],
	]);
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
	const endExtension = (targetLength - tileCount * PICA_TILE_PITCH) / 2;
	const railLength = tileCount * PICA_TILE_PITCH + endExtension * 2;

	return {
		tileSize: safeTileSize,
		tileLength: safeTileLength,
		targetLength,
		tileCount,
		endExtension,
		railLength: Math.max(0, railLength),
	};
}

function buildPicaRailBase(Manifold, CrossSection, config) {
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

function buildPicaRailSlots(Manifold, config) {
	if (config.tileCount <= 0 || config.railLength <= 0) {
		return emptyManifold(Manifold);
	}
	const booleanOverlap = 0.2;
	const slotDepth = Math.min(PICA_SLOT_DEPTH, PICA_RAIL_HEIGHT);
	const slotCutHeight = slotDepth + booleanOverlap;
	const slotCenterZ = PICA_RAIL_HEIGHT - slotDepth / 2 + booleanOverlap / 2;
	const slots = [];
	for (let index = 0; index < config.tileCount; index++) {
		const slotStart = config.endExtension + index * PICA_TILE_PITCH + PICA_TILE_OFFSET;
		const slotCenter = slotStart + PICA_TILE_SLOT_WIDTH / 2;
		slots.push(
			Manifold.cube(
				[PICA_TILE_SLOT_WIDTH, PICA_RAIL_TOP_WIDTH + 0.04, slotCutHeight],
				true,
			).translate(slotCenter, 0, slotCenterZ),
		);
	}
	return unionAll(Manifold, slots);
}

async function buildPicaRailModelFromConfig(config = {}) {
	const { Manifold, CrossSection } = await getManifoldApi();
	const settings = normalizeLengthConfig(config);
	const railLength = Math.max(0, settings.railLength);
	const body = buildPicaRailBase(Manifold, CrossSection, {
		...settings,
		railLength,
	});
	const cuts = buildPicaRailSlots(Manifold, settings);
	return body.subtract(cuts);
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
