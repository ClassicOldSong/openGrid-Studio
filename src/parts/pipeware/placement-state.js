import {
	buildPipewareEdgeKey,
	createPipewarePlacementBandTester,
	filterPipewarePlacementEdgeCuts,
	getBasePipewareLGeometry,
	getPipewarePlacementBounds,
	getPipewarePlacementCuttableEdgeKeys,
	getPipewarePlacementEditableEdgeKeys,
	getPipewarePlacementFootprintCells,
	normalizePipewareFeatureConfig,
	normalizePipewareFeatureType,
	normalizePipewarePlacement,
	normalizePipewareRotation,
	parsePipewareEdgeKey,
	pipewarePlacementGeometrySticksOut,
	remapPipewareEdgeCutsForPlacementChange,
} from "./feature-library.js";
import {
	PIPEWARE_DEFAULT_BOARD_THICKNESS,
	PIPEWARE_DEFAULT_EDITOR_STATE,
} from "./constants.js";

const PIPEWARE_COLLISION_SAMPLE_RESOLUTION = 24;
const PIPEWARE_BRIDGE_CLEARANCE_OVERHEAD = 7.4;

function nextPipewarePlacementId(placements) {
	const nextNumber =
		placements.reduce((maxValue, placement) => {
			const match = /^uw-(\d+)$/.exec(String(placement.id));
			if (!match) return maxValue;
			return Math.max(maxValue, Number(match[1]));
		}, 0) + 1;
	return `uw-${nextNumber}`;
}

function placementWithinBoard(placement, width, height) {
	return getPipewarePlacementFootprintCells(placement).every(
		({ tx, ty }) => tx >= 0 && ty >= 0 && tx < width && ty < height,
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
	return {
		x: nextX,
		y: nextY,
		width: nextWidth,
		height: nextHeight,
	};
}

function hasOwn(object, key) {
	return Object.prototype.hasOwnProperty.call(object, key);
}

function getPipewareLInnerCornerLocal(placement) {
	if (placement.type !== "L") return null;
	const geometry = getBasePipewareLGeometry(placement.params);
	return rotateLocalPointCCWNTimes(
		geometry.center.x,
		geometry.center.y,
		geometry.baseWidth,
		geometry.baseHeight,
		normalizePipewareRotation(placement.rotation) / 90,
	);
}

function getPipewareLInnerCornerWorld(placement) {
	const local = getPipewareLInnerCornerLocal(placement);
	if (!local) return null;
	return {
		x: (placement.anchor?.tx ?? 0) + local.x,
		y: (placement.anchor?.ty ?? 0) + local.y,
	};
}

function shouldAnchorPipewareLParamChangeToInnerCorner(placement, patch) {
	return (
		placement.type === "L" &&
		(hasOwn(patch, "addedRadiusUnits") || hasOwn(patch, "widthUnits"))
	);
}

function anchorPipewareLParamChangeToInnerCorner(placement, nextPlacement, patch) {
	if (!shouldAnchorPipewareLParamChangeToInnerCorner(placement, patch)) {
		return nextPlacement;
	}
	const innerCornerWorld = getPipewareLInnerCornerWorld(placement);
	const nextInnerCornerLocal = getPipewareLInnerCornerLocal(nextPlacement);
	if (!innerCornerWorld || !nextInnerCornerLocal) return nextPlacement;
	return {
		...nextPlacement,
		anchor: {
			tx: Math.round(innerCornerWorld.x - nextInnerCornerLocal.x),
			ty: Math.round(innerCornerWorld.y - nextInnerCornerLocal.y),
		},
	};
}

export function pipewarePlacementsOverlap(a, b) {
	if (a?.type === "B" && b?.type === "B") {
		return pipewareBridgeBridgePlacementsOverlap(a, b);
	}
	if (a?.type === "B" && b?.type !== "B") {
		return pipewareBridgePlacementOverlaps(a, b);
	}
	if (b?.type === "B" && a?.type !== "B") {
		return pipewareBridgePlacementOverlaps(b, a);
	}
	const aZRange = getPipewarePlacementCollisionZRange(a);
	const bZRange = getPipewarePlacementCollisionZRange(b);
	if (aZRange.max <= bZRange.min || bZRange.max <= aZRange.min) return false;
	const aBounds = getPipewarePlacementBounds(a);
	const bBounds = getPipewarePlacementBounds(b);
	const minX = Math.max(aBounds.tx, bBounds.tx);
	const minY = Math.max(aBounds.ty, bBounds.ty);
	const maxX = Math.min(aBounds.tx + aBounds.width, bBounds.tx + bBounds.width);
	const maxY = Math.min(aBounds.ty + aBounds.height, bBounds.ty + bBounds.height);
	if (minX >= maxX || minY >= maxY) return false;

	const startSampleX = Math.floor(minX * PIPEWARE_COLLISION_SAMPLE_RESOLUTION);
	const startSampleY = Math.floor(minY * PIPEWARE_COLLISION_SAMPLE_RESOLUTION);
	const endSampleX = Math.ceil(maxX * PIPEWARE_COLLISION_SAMPLE_RESOLUTION);
	const endSampleY = Math.ceil(maxY * PIPEWARE_COLLISION_SAMPLE_RESOLUTION);
	const pointInsideA = createPipewarePlacementBandTester(a);
	const pointInsideB = createPipewarePlacementBandTester(b);
	for (let sampleY = startSampleY; sampleY < endSampleY; sampleY++) {
		for (let sampleX = startSampleX; sampleX < endSampleX; sampleX++) {
			const x = (sampleX + 0.5) / PIPEWARE_COLLISION_SAMPLE_RESOLUTION;
			const y = (sampleY + 0.5) / PIPEWARE_COLLISION_SAMPLE_RESOLUTION;
			if (pointInsideA(x, y) && pointInsideB(x, y)) {
				return true;
			}
		}
	}
	return false;
}

function pipewareBridgeClearanceCoversPlacement(bridge, placement) {
	const clearance = Number(bridge?.params?.bridgeClearanceValue);
	return (
		Number.isFinite(clearance) &&
		clearance >= getPipewarePlacementCollisionHeight(placement)
	);
}

function getPipewareBridgeClearance(bridge) {
	const clearance = Number(bridge?.params?.bridgeClearanceValue);
	return Number.isFinite(clearance) && clearance > 0 ? clearance : 0;
}

function pointInPipewareBridgeLoweredSpan(bridge, x, y) {
	const bounds = getPipewarePlacementBounds(bridge);
	const turns = normalizePipewareRotation(bridge.rotation) / 90;
	const localX = x - bounds.tx;
	const localY = y - bounds.ty;
	const basePoint = rotateLocalPointCCWNTimes(
		localX,
		localY,
		bounds.width,
		bounds.height,
		(4 - turns) % 4,
	);
	const length = Math.max(0, Number(bridge?.params?.lengthUnits) || 0);
	const totalLength = length + 2;
	const transition = 1;
	return (
		basePoint.x > transition &&
		basePoint.x < totalLength - transition
	);
}

function pipewareBridgeBridgePlacementsOverlap(a, b) {
	const aBounds = getPipewarePlacementBounds(a);
	const bBounds = getPipewarePlacementBounds(b);
	const minX = Math.max(aBounds.tx, bBounds.tx);
	const minY = Math.max(aBounds.ty, bBounds.ty);
	const maxX = Math.min(aBounds.tx + aBounds.width, bBounds.tx + bBounds.width);
	const maxY = Math.min(aBounds.ty + aBounds.height, bBounds.ty + bBounds.height);
	if (minX >= maxX || minY >= maxY) return false;

	const startSampleX = Math.floor(minX * PIPEWARE_COLLISION_SAMPLE_RESOLUTION);
	const startSampleY = Math.floor(minY * PIPEWARE_COLLISION_SAMPLE_RESOLUTION);
	const endSampleX = Math.ceil(maxX * PIPEWARE_COLLISION_SAMPLE_RESOLUTION);
	const endSampleY = Math.ceil(maxY * PIPEWARE_COLLISION_SAMPLE_RESOLUTION);
	const pointInsideA = createPipewarePlacementBandTester(a);
	const pointInsideB = createPipewarePlacementBandTester(b);
	const aClearance = getPipewareBridgeClearance(a);
	const bClearance = getPipewareBridgeClearance(b);
	const aClearanceCoversB = pipewareBridgeClearanceCoversPlacement(a, b);
	const bClearanceCoversA = pipewareBridgeClearanceCoversPlacement(b, a);
	for (let sampleY = startSampleY; sampleY < endSampleY; sampleY++) {
		for (let sampleX = startSampleX; sampleX < endSampleX; sampleX++) {
			const x = (sampleX + 0.5) / PIPEWARE_COLLISION_SAMPLE_RESOLUTION;
			const y = (sampleY + 0.5) / PIPEWARE_COLLISION_SAMPLE_RESOLUTION;
			if (!pointInsideA(x, y) || !pointInsideB(x, y)) continue;
			const aLowered = pointInPipewareBridgeLoweredSpan(a, x, y);
			const bLowered = pointInPipewareBridgeLoweredSpan(b, x, y);
			if (
				(aLowered &&
					aClearanceCoversB &&
					aClearance > bClearance + Number.EPSILON) ||
				(bLowered &&
					bClearanceCoversA &&
					bClearance > aClearance + Number.EPSILON)
			) {
				continue;
			}
			return true;
		}
	}
	return false;
}

function pipewareBridgePlacementOverlaps(bridge, placement) {
	const bridgeBounds = getPipewarePlacementBounds(bridge);
	const placementBounds = getPipewarePlacementBounds(placement);
	const minX = Math.max(bridgeBounds.tx, placementBounds.tx);
	const minY = Math.max(bridgeBounds.ty, placementBounds.ty);
	const maxX = Math.min(
		bridgeBounds.tx + bridgeBounds.width,
		placementBounds.tx + placementBounds.width,
	);
	const maxY = Math.min(
		bridgeBounds.ty + bridgeBounds.height,
		placementBounds.ty + placementBounds.height,
	);
	if (minX >= maxX || minY >= maxY) return false;

	const startSampleX = Math.floor(minX * PIPEWARE_COLLISION_SAMPLE_RESOLUTION);
	const startSampleY = Math.floor(minY * PIPEWARE_COLLISION_SAMPLE_RESOLUTION);
	const endSampleX = Math.ceil(maxX * PIPEWARE_COLLISION_SAMPLE_RESOLUTION);
	const endSampleY = Math.ceil(maxY * PIPEWARE_COLLISION_SAMPLE_RESOLUTION);
	const pointInsideBridge = createPipewarePlacementBandTester(bridge);
	const pointInsidePlacement = createPipewarePlacementBandTester(placement);
	const clearanceCoversPlacement = pipewareBridgeClearanceCoversPlacement(
		bridge,
		placement,
	);

	for (let sampleY = startSampleY; sampleY < endSampleY; sampleY++) {
		for (let sampleX = startSampleX; sampleX < endSampleX; sampleX++) {
			const x = (sampleX + 0.5) / PIPEWARE_COLLISION_SAMPLE_RESOLUTION;
			const y = (sampleY + 0.5) / PIPEWARE_COLLISION_SAMPLE_RESOLUTION;
			if (!pointInsideBridge(x, y) || !pointInsidePlacement(x, y)) continue;
			if (
				clearanceCoversPlacement &&
				pointInPipewareBridgeLoweredSpan(bridge, x, y)
			) {
				continue;
			}
			return true;
		}
	}
	return false;
}

function getPipewarePlacementCollisionHeight(placement) {
	const height = Number(placement?.params?.zHeightValue);
	const innerHeight = Number.isFinite(height) && height > 0
		? height
		: PIPEWARE_DEFAULT_BOARD_THICKNESS;
	return innerHeight + PIPEWARE_BRIDGE_CLEARANCE_OVERHEAD;
}

function getPipewarePlacementCollisionZRange(placement) {
	const min =
		placement?.type === "B"
			? Math.max(0, Number(placement?.params?.bridgeClearanceValue) || 0)
			: 0;
	return {
		min,
		max: min + getPipewarePlacementCollisionHeight(placement),
	};
}

function canUsePlacement(candidate, placements, width, height, skipId = null) {
	if (pipewarePlacementGeometrySticksOut(candidate)) return false;
	if (!placementWithinBoard(candidate, width, height)) return false;
	return !placements.some(
		(placement) =>
			placement.id !== skipId && pipewarePlacementsOverlap(candidate, placement),
	);
}

function mapPlacementUpdate(placements, placementId, updater) {
	let changed = false;
	const nextPlacements = placements.map((placement) => {
		if (placement.id !== placementId) return placement;
		const nextPlacement = updater(placement);
		if (nextPlacement !== placement) changed = true;
		return nextPlacement;
	});
	return changed ? nextPlacements : placements;
}

export function createPipewarePlacement(
	placements,
	featureConfig,
	tx,
	ty,
) {
	const normalizedFeatureConfig = normalizePipewareFeatureConfig(featureConfig);
	return normalizePipewarePlacement({
		id: nextPipewarePlacementId(placements),
		type: normalizedFeatureConfig.type,
		anchor: { tx, ty },
		rotation: normalizedFeatureConfig.rotation,
		params: normalizedFeatureConfig.params,
		edgeCuts: [],
	});
}

function getPipewarePlacementRotationCandidates(basePlacement) {
	const startRotation = normalizePipewareRotation(basePlacement.rotation);
	const rotations = [];
	for (const offset of [0, -90, -180, -270]) {
		const rotation = normalizePipewareRotation(startRotation + offset);
		if (!rotations.includes(rotation)) rotations.push(rotation);
	}
	return rotations;
}

function createPipewarePlacementAtRotation(basePlacement, rotation) {
	return normalizePipewarePlacement({
		...basePlacement,
		rotation,
	});
}

function createPipewarePlacementAtAnchor(basePlacement, tx, ty) {
	return normalizePipewarePlacement({
		...basePlacement,
		anchor: { tx, ty },
	});
}

function getPipewarePlacementAnchorCandidatesForCenter(
	basePlacement,
	centerX,
	centerY,
	width,
	height,
) {
	const bounds = getPipewarePlacementBounds(basePlacement);
	const maxTx = width - bounds.width;
	const maxTy = height - bounds.height;
	if (maxTx < 0 || maxTy < 0) return [];
	const idealTx = centerX - bounds.width / 2;
	const idealTy = centerY - bounds.height / 2;
	const anchors = [];

	for (let ty = 0; ty <= maxTy; ty++) {
		for (let tx = 0; tx <= maxTx; tx++) {
			if (
				centerX < tx ||
				centerY < ty ||
				centerX > tx + bounds.width ||
				centerY > ty + bounds.height
			) {
				continue;
			}
			anchors.push({
				tx,
				ty,
				distance:
					(tx - idealTx) * (tx - idealTx) + (ty - idealTy) * (ty - idealTy),
			});
		}
	}

	anchors.sort((a, b) => {
		if (a.distance !== b.distance) return a.distance - b.distance;
		if (a.ty !== b.ty) return a.ty - b.ty;
		return a.tx - b.tx;
	});
	return anchors;
}

function findUsablePipewarePlacementForCenter(
	basePlacement,
	centerX,
	centerY,
	placements,
	width,
	height,
) {
	for (const rotation of getPipewarePlacementRotationCandidates(basePlacement)) {
		const rotatedPlacement = createPipewarePlacementAtRotation(
			basePlacement,
			rotation,
		);
		for (const anchor of getPipewarePlacementAnchorCandidatesForCenter(
			rotatedPlacement,
			centerX,
			centerY,
			width,
			height,
		)) {
			const candidate = createPipewarePlacementAtAnchor(
				rotatedPlacement,
				anchor.tx,
				anchor.ty,
			);
			if (canUsePlacement(candidate, placements, width, height)) {
				return candidate;
			}
		}
	}
	return null;
}

export function createPipewarePlacementPreview(
	placements,
	featureConfig,
	centerX,
	centerY,
	width,
	height,
) {
	return findUsablePipewarePlacementForCenter(
		createPipewarePlacement(
			placements,
			featureConfig,
			Math.floor(centerX),
			Math.floor(centerY),
		),
		centerX,
		centerY,
		placements,
		width,
		height,
	);
}

export function ensurePipewarePlacements(placements, width, height, tileSize = null) {
	const nextPlacements = [];
	for (const placement of Array.isArray(placements) ? placements : []) {
		const normalized = normalizePipewarePlacement(placement);
		normalized.edgeCuts = filterPipewarePlacementEdgeCuts(normalized, tileSize);
		if (!canUsePlacement(normalized, nextPlacements, width, height)) continue;
		nextPlacements.push(normalized);
	}
	return nextPlacements;
}

export function createPipewareEditorStateDefaults() {
	return {
		pipewarePlacements: [],
		pipewareSelectedPlacementId:
			PIPEWARE_DEFAULT_EDITOR_STATE.pipewareSelectedPlacementId,
		pipewareActiveFeatureConfig: normalizePipewareFeatureConfig(
			PIPEWARE_DEFAULT_EDITOR_STATE.pipewareActiveFeatureConfig,
		),
	};
}

export function placePipewarePlacement(
	placements,
	featureConfig,
	centerX,
	centerY,
	width,
	height,
) {
	const candidate = createPipewarePlacementPreview(
		placements,
		featureConfig,
		centerX,
		centerY,
		width,
		height,
	);
	if (!candidate) return null;
	return [...placements, candidate];
}

export function rotatePipewarePlacement(placements, placementId, width, height) {
	let nextSelectionId = placementId;
	const nextPlacements = mapPlacementUpdate(placements, placementId, (placement) => {
		const candidate = normalizePipewarePlacement({
			...placement,
			rotation: normalizePipewareRotation(placement.rotation - 90),
		});
		if (!canUsePlacement(candidate, placements, width, height, placementId)) {
			nextSelectionId = placement.id;
			return placement;
		}
		return candidate;
	});
	return nextPlacements === placements
		? null
		: { placements: nextPlacements, selectedPlacementId: nextSelectionId };
}

export function removePipewarePlacement(placements, placementId) {
	const nextPlacements = placements.filter(
		(placement) => placement.id !== placementId,
	);
	return nextPlacements.length === placements.length ? null : nextPlacements;
}

export function togglePipewarePlacementEdgeCut(
	placements,
	placementId,
	edgeKey,
	groupEdgeKeys = null,
	tileSize = null,
) {
	const parsed = parsePipewareEdgeKey(edgeKey);
	if (!parsed) return null;
	let changed = false;
	const nextPlacements = placements.map((placement) => {
		if (placement.id !== placementId) return placement;
		const physicalTileSize = Number(tileSize);
		const allowedEdges = new Set(
			Number.isFinite(physicalTileSize) && physicalTileSize > 0
				? getPipewarePlacementCuttableEdgeKeys(placement, physicalTileSize)
				: getPipewarePlacementEditableEdgeKeys(placement),
		);
		if (!allowedEdges.has(edgeKey)) return placement;
		const toggleKeys = [
			edgeKey,
			...(Array.isArray(groupEdgeKeys) ? groupEdgeKeys : []),
		].filter(
			(candidateEdgeKey, index, list) =>
				allowedEdges.has(candidateEdgeKey) &&
				list.indexOf(candidateEdgeKey) === index,
		);
		const edgeCuts = new Set(placement.edgeCuts ?? []);
		const active = toggleKeys.some((candidateEdgeKey) =>
			edgeCuts.has(candidateEdgeKey),
		);
		if (active) {
			for (const candidateEdgeKey of toggleKeys) {
				edgeCuts.delete(candidateEdgeKey);
			}
		} else {
			edgeCuts.add(edgeKey);
		}
		changed = true;
		return {
			...placement,
			edgeCuts: [...edgeCuts],
		};
	});
	return changed ? nextPlacements : null;
}

export function updatePipewarePlacementParams(
	placements,
	placementId,
	patch,
	width,
	height,
	tileSize = null,
) {
	let changed = false;
	const nextPlacements = placements.map((placement) => {
		if (placement.id !== placementId) return placement;
		const nextPlacement = {
			...placement,
			params: {
				...placement.params,
				...patch,
			},
		};
		const anchoredPlacement = anchorPipewareLParamChangeToInnerCorner(
			placement,
			normalizePipewarePlacement(nextPlacement),
			patch,
		);
		anchoredPlacement.edgeCuts = remapPipewareEdgeCutsForPlacementChange(
			placement.edgeCuts,
			placement,
			anchoredPlacement,
		);
		if (
			(anchoredPlacement.anchor?.tx ?? 0) < 0 ||
			(anchoredPlacement.anchor?.ty ?? 0) < 0
		) {
			return placement;
		}
		const candidate = anchoredPlacement;
		if (!canUsePlacement(candidate, placements, width, height, placementId)) {
			return placement;
		}
		candidate.edgeCuts = filterPipewarePlacementEdgeCuts(candidate, tileSize);
		changed = true;
		return candidate;
	});
	return changed ? nextPlacements : null;
}

export function updatePipewareFeatureConfig(featureConfig, patch) {
	const type = normalizePipewareFeatureType(patch?.type ?? featureConfig?.type);
	return normalizePipewareFeatureConfig({
		type,
		rotation: patch?.rotation ?? featureConfig?.rotation,
		params: {
			...(type === featureConfig?.type ? featureConfig?.params : {}),
			...patch?.params,
		},
	});
}

export function replacePipewarePlacement(
	placements,
	candidatePlacement,
	width,
	height,
	tileSize = null,
) {
	const candidate = normalizePipewarePlacement(candidatePlacement);
	candidate.edgeCuts = filterPipewarePlacementEdgeCuts(candidate, tileSize);
	if (!canUsePlacement(candidate, placements, width, height, candidate.id)) {
		return null;
	}
	let changed = false;
	const nextPlacements = placements.map((placement) => {
		if (placement.id !== candidate.id) return placement;
		changed = true;
		return candidate;
	});
	return changed ? nextPlacements : null;
}

export function getPipewarePlacementById(placements, placementId) {
	return placements.find((placement) => placement.id === placementId) ?? null;
}

export function createPipewareBoundsRect(placement, tileSize, pad) {
	const bounds = getPipewarePlacementBounds(placement);
	return {
		x: pad + bounds.tx * tileSize,
		y: pad + bounds.ty * tileSize,
		w: bounds.width * tileSize,
		h: bounds.height * tileSize,
	};
}

export function createPipewareOpeningNotch(edgeKey, tileSize, pad, depth) {
	const parsed = parsePipewareEdgeKey(edgeKey);
	if (!parsed) return null;
	const channelBand = tileSize * 0.56;
	const crossInset = (tileSize - channelBand) / 2;
	const edgeCenterInset = crossInset - depth / 2;
	const tileX = pad + parsed.tx * tileSize;
	const tileY = pad + parsed.ty * tileSize;
	switch (parsed.side) {
		case "N":
			return {
				x: tileX + crossInset,
				y: tileY + edgeCenterInset,
				w: channelBand,
				h: depth,
			};
		case "E":
			return {
				x: tileX + tileSize - crossInset - depth / 2,
				y: tileY + crossInset,
				w: depth,
				h: channelBand,
			};
		case "S":
			return {
				x: tileX + crossInset,
				y: tileY + tileSize - crossInset - depth / 2,
				w: channelBand,
				h: depth,
			};
		case "W":
			return {
				x: tileX + edgeCenterInset,
				y: tileY + crossInset,
				w: depth,
				h: channelBand,
			};
		default:
			return null;
	}
}

export function getPipewarePlacementStatusLabel(placement) {
	if (!placement) return "No placement selected";
	const bounds = getPipewarePlacementBounds(placement);
	return `${placement.type} • ${bounds.width}×${bounds.height}`;
}

export function createPipewareOpeningHint(type) {
	if (type === "L") {
		return "Select a corner, then tap the highlighted exposed edges to add side cut openings.";
	}
	if (type === "I") {
		return "Select a straight, then tap the highlighted exposed edges to add side cut openings.";
	}
	return "Select a Pipeware part, then tap the highlighted exposed edges to add side cut openings.";
}
