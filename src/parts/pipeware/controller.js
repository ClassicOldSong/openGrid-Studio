import { $, signal, watch } from "refui";
import {
	createPipewareEditorStateDefaults,
	ensurePipewarePlacements,
	getPipewarePlacementById,
	getPipewarePlacementStatusLabel,
	createPipewarePlacementPreview,
	placePipewarePlacement,
	removePipewarePlacement,
	replacePipewarePlacement,
	togglePipewarePlacementEdgeCut,
	updatePipewareFeatureConfig,
	updatePipewarePlacementParams,
} from "./placement-state.js";
import {
	createPipewareFeatureConfigFromPlacement,
	getPipewarePlacementBounds,
	normalizePipewareFeatureConfig,
	normalizePipewareFeatureType,
	normalizePipewarePlacement,
	normalizePipewareRotation,
	pipewareFeatureGeometrySticksOut,
	remapPipewareEdgeCutsForPlacementChange,
	rotatePipewareEdgeKeyCCW,
} from "./feature-library.js";
import {
	PIPEWARE_DEFAULT_BOARD_THICKNESS,
	PIPEWARE_THICKNESS_MIN,
} from "./constants.js";

const DEFAULT_PIPEWARE_EDITOR_STATE = createPipewareEditorStateDefaults();
const PIPEWARE_MAX_WIDTH_UNITS = 8;
const PIPEWARE_MAX_OFFSET_UNITS = 12;

function clampInteger(value, min, max) {
	if (max < min) return min;
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return min;
	return Math.max(min, Math.min(max, Math.round(numeric)));
}

function resolvePipewareBoardThickness(config = {}, defaults = {}) {
	const raw =
		config.pipewareBoardThicknessValue ??
		config.pipewareHeightValue ??
		config.channelHeightValue ??
		defaults.pipewareBoardThicknessValue ??
		defaults.pipewareHeightValue ??
		defaults.channelHeightValue ??
		PIPEWARE_DEFAULT_BOARD_THICKNESS;
	const numeric = Number(raw);
	if (!Number.isFinite(numeric)) return PIPEWARE_DEFAULT_BOARD_THICKNESS;
	return Math.max(PIPEWARE_THICKNESS_MIN, numeric);
}

function getPipewareFixedBoundsParamPatch(
	placement,
	key,
	rawValue,
	paramSide = null,
) {
	const params = placement?.params ?? {};
	const type = placement?.type;
	if (type === "T" || type === "X") {
		const minSideLength = type === "T" ? 0 : 1;
		if (key === "widthUnitsY") {
			const currentSpan = params.widthUnitsY ?? params.widthUnits ?? 1;
			const fixedLeft =
				paramSide === "left" ? null : params.lengthUnitsLeft ?? minSideLength;
			const fixedRight =
				paramSide === "left" ? params.lengthUnitsRight ?? minSideLength : null;
			const total =
				(params.lengthUnitsLeft ?? minSideLength) +
				(params.lengthUnitsRight ?? minSideLength) +
				currentSpan;
			const nextSpan = clampInteger(
				Math.min(Number(rawValue), PIPEWARE_MAX_WIDTH_UNITS),
				1,
				paramSide === "left"
					? total - fixedRight - minSideLength
					: total - fixedLeft - minSideLength,
			);
			if (paramSide === "left") {
				return {
					widthUnitsY: nextSpan,
					lengthUnitsLeft: total - fixedRight - nextSpan,
					lengthUnitsRight: fixedRight,
				};
			}
			return {
				widthUnitsY: nextSpan,
				lengthUnitsLeft: fixedLeft,
				lengthUnitsRight: total - fixedLeft - nextSpan,
			};
		}
		if (key === "widthUnitsX") {
			const currentSpan = params.widthUnitsX ?? params.widthUnits ?? 1;
			if (type === "T") {
				const total = (params.lengthUnitsY ?? 1) + currentSpan;
				const nextSpan = clampInteger(
					Math.min(Number(rawValue), PIPEWARE_MAX_WIDTH_UNITS),
					1,
					total - 1,
				);
				return {
					widthUnitsX: nextSpan,
					lengthUnitsY: total - nextSpan,
				};
			}
			const total =
				(params.lengthUnitsTop ?? 1) +
				(params.lengthUnitsBottom ?? 1) +
				currentSpan;
			const fixedTop =
				paramSide === "top" ? null : params.lengthUnitsTop ?? 1;
			const fixedBottom =
				paramSide === "top" ? params.lengthUnitsBottom ?? 1 : null;
			const nextSpan = clampInteger(
				Math.min(Number(rawValue), PIPEWARE_MAX_WIDTH_UNITS),
				1,
				paramSide === "top" ? total - fixedBottom - 1 : total - fixedTop - 1,
			);
			if (paramSide === "top") {
				return {
					widthUnitsX: nextSpan,
					lengthUnitsTop: total - fixedBottom - nextSpan,
					lengthUnitsBottom: fixedBottom,
				};
			}
			return {
				widthUnitsX: nextSpan,
				lengthUnitsTop: fixedTop,
				lengthUnitsBottom: total - fixedTop - nextSpan,
			};
		}
	}

	if (type === "S" || type === "D") {
		const channelWidth = params.channelWidthUnits ?? params.widthUnits ?? 1;
		const offset = params.offsetUnits ?? 0;
		const horizontalTotal = Math.abs(offset) + channelWidth;
		if (key === "channelWidthUnits") {
			const totalHeight =
				(params.lengthUnitsBottom ?? 0) +
				(params.riseUnits ?? 1) +
				(params.lengthUnitsTop ?? 0);
			const currentHeight = Math.max(channelWidth, totalHeight);
			const nextWidth = clampInteger(
				Math.min(Number(rawValue), PIPEWARE_MAX_WIDTH_UNITS),
				1,
				Math.max(1, Math.min(horizontalTotal, currentHeight)),
			);
			const sign = offset < 0 ? -1 : 1;
			return {
				channelWidthUnits: nextWidth,
				offsetUnits: sign * (horizontalTotal - nextWidth),
			};
		}
		if (key === "offsetUnits") {
			return {
				offsetUnits: clampInteger(
					Number(rawValue),
					-PIPEWARE_MAX_OFFSET_UNITS,
					PIPEWARE_MAX_OFFSET_UNITS,
				),
			};
		}
		if (key === "lengthUnitsBottom") {
			const currentRise = params.riseUnits ?? 1;
			const total =
				(params.lengthUnitsBottom ?? 0) +
				currentRise +
				(params.lengthUnitsTop ?? 0);
			const rise = clampInteger(currentRise, 1, Math.max(1, total - 2));
			const straightTotal = total - rise;
			const nextBottom = clampInteger(Number(rawValue), 1, straightTotal - 1);
			return {
				riseUnits: rise,
				lengthUnitsBottom: nextBottom,
				lengthUnitsTop: straightTotal - nextBottom,
			};
		}
		if (key === "riseUnits") {
			const total =
				(params.lengthUnitsBottom ?? 0) +
				(params.riseUnits ?? 1) +
				(params.lengthUnitsTop ?? 0);
			const nextRise = clampInteger(Number(rawValue), 1, Math.max(1, total - 2));
			const nextBottom = clampInteger(
				params.lengthUnitsBottom ?? 1,
				1,
				total - nextRise - 1,
			);
			return {
				riseUnits: nextRise,
				lengthUnitsBottom: nextBottom,
				lengthUnitsTop: total - nextBottom - nextRise,
			};
		}
	}

	return { [key]: rawValue };
}

function resolvePipewareFeatureConfig(config = {}, defaults = {}) {
	if (config.pipewareActiveFeatureConfig) {
		return normalizePipewareFeatureConfig(config.pipewareActiveFeatureConfig);
	}
	if (config.pipewareToolType && config.pipewareToolType !== "erase") {
		const type = normalizePipewareFeatureType(config.pipewareToolType);
		return normalizePipewareFeatureConfig({
			type,
			params: config.pipewareToolParams?.[type],
		});
	}
	if (defaults.pipewareActiveFeatureConfig) {
		return normalizePipewareFeatureConfig(defaults.pipewareActiveFeatureConfig);
	}
	if (defaults.pipewareToolType && defaults.pipewareToolType !== "erase") {
		const type = normalizePipewareFeatureType(defaults.pipewareToolType);
		return normalizePipewareFeatureConfig({
			type,
			params: defaults.pipewareToolParams?.[type],
		});
	}
	return normalizePipewareFeatureConfig(
		DEFAULT_PIPEWARE_EDITOR_STATE.pipewareActiveFeatureConfig,
	);
}

function rotatePipewareEdgeCuts(edgeCuts, width, height, turns) {
	return (edgeCuts ?? [])
		.map((edgeKey) => rotatePipewareEdgeKeyCCW(edgeKey, width, height, turns))
		.filter(Boolean);
}

function pipewareBoundsOverlap(a, b) {
	return (
		a.tx < b.tx + b.width &&
		b.tx < a.tx + a.width &&
		a.ty < b.ty + b.height &&
		b.ty < a.ty + a.height
	);
}

function rotatePipewareCardinalSideCCW(side) {
	switch (side) {
		case "N":
			return "W";
		case "W":
			return "S";
		case "S":
			return "E";
		case "E":
			return "N";
		default:
			return side;
	}
}

function rotatePipewareCardinalSideCCWNTimes(side, turns) {
	let nextSide = side;
	const normalizedTurns = ((turns % 4) + 4) % 4;
	for (let index = 0; index < normalizedTurns; index++) {
		nextSide = rotatePipewareCardinalSideCCW(nextSide);
	}
	return nextSide;
}

function getPipewareOffsetResizeDirection(offsetUnits, baseSide) {
	if (offsetUnits > 0) return 1;
	if (offsetUnits < 0) return -1;
	return baseSide === "W" ? -1 : 1;
}

function getPipewareGenericResizeParamPatch(placement, baseSide, deltaUnits) {
	const params = placement.params ?? {};
	switch (placement.type) {
		case "T":
			if (baseSide === "W") {
				return { lengthUnitsLeft: (params.lengthUnitsLeft ?? 0) + deltaUnits };
			}
			if (baseSide === "E") {
				return {
					lengthUnitsRight: (params.lengthUnitsRight ?? 0) + deltaUnits,
				};
			}
			if (baseSide === "S") {
				return { lengthUnitsY: (params.lengthUnitsY ?? 1) + deltaUnits };
			}
			return null;
		case "X":
			if (baseSide === "W") {
				return { lengthUnitsLeft: (params.lengthUnitsLeft ?? 1) + deltaUnits };
			}
			if (baseSide === "E") {
				return {
					lengthUnitsRight: (params.lengthUnitsRight ?? 1) + deltaUnits,
				};
			}
			if (baseSide === "N") {
				return { lengthUnitsTop: (params.lengthUnitsTop ?? 1) + deltaUnits };
			}
			if (baseSide === "S") {
				return {
					lengthUnitsBottom: (params.lengthUnitsBottom ?? 1) + deltaUnits,
				};
			}
			return null;
		case "S":
		case "D":
			if (baseSide === "E" || baseSide === "W") {
				const offsetUnits = params.offsetUnits ?? 0;
				return {
					offsetUnits:
						offsetUnits +
						getPipewareOffsetResizeDirection(offsetUnits, baseSide) *
							deltaUnits,
				};
			}
			if (baseSide === "N") {
				return {
					lengthUnitsBottom: (params.lengthUnitsBottom ?? 0) + deltaUnits,
				};
			}
			if (baseSide === "S") {
				return { lengthUnitsTop: (params.lengthUnitsTop ?? 0) + deltaUnits };
			}
			return null;
		default:
			return null;
	}
}

function getPipewareResizeDeltaForWorldSide(handleSide, deltaX, deltaY) {
	if (handleSide === "E") return deltaX;
	if (handleSide === "W") return -deltaX;
	if (handleSide === "S") return deltaY;
	if (handleSide === "N") return -deltaY;
	return 0;
}

function getCenterRotationAnchorCandidates(
	rotatedBounds,
	centerX,
	centerY,
	currentAnchor,
	boardWidth,
	boardHeight,
) {
	const maxTx = boardWidth - rotatedBounds.width;
	const maxTy = boardHeight - rotatedBounds.height;
	if (maxTx < 0 || maxTy < 0) return [];
	const idealTx = centerX - rotatedBounds.width / 2;
	const idealTy = centerY - rotatedBounds.height / 2;
	const anchors = [];

	for (let ty = 0; ty <= maxTy; ty++) {
		for (let tx = 0; tx <= maxTx; tx++) {
			anchors.push({
				tx,
				ty,
				centerDistance:
					(tx - idealTx) * (tx - idealTx) + (ty - idealTy) * (ty - idealTy),
				currentDistance:
					(tx - currentAnchor.tx) * (tx - currentAnchor.tx) +
					(ty - currentAnchor.ty) * (ty - currentAnchor.ty),
			});
		}
	}

	anchors.sort((a, b) => {
		if (a.centerDistance !== b.centerDistance) {
			return a.centerDistance - b.centerDistance;
		}
		if (a.currentDistance !== b.currentDistance) {
			return a.currentDistance - b.currentDistance;
		}
		if (a.ty !== b.ty) return a.ty - b.ty;
		return a.tx - b.tx;
	});
	return anchors;
}

export function createPipewareController({
	tileSize,
	editorPad = 0,
	initialConfig,
	defaults,
}) {
	const width = signal(initialConfig.width ?? defaults.width);
	const height = signal(initialConfig.height ?? defaults.height);
	const tileSizeValue = signal(
		initialConfig.tileSizeValue ?? defaults.tileSizeValue,
	);
	const pipewareBoardThicknessValue = signal(
		resolvePipewareBoardThickness(initialConfig, defaults),
	);
	const circleSegmentsValue = signal(
		initialConfig.circleSegmentsValue ?? defaults.circleSegmentsValue,
	);
	const pipewarePlacements = signal(
		ensurePipewarePlacements(
			initialConfig.pipewarePlacements ??
				DEFAULT_PIPEWARE_EDITOR_STATE.pipewarePlacements,
			initialConfig.width ?? defaults.width,
			initialConfig.height ?? defaults.height,
			tileSizeValue.value,
		),
	);
	const pipewareSelectedPlacementId = signal(
		initialConfig.pipewareSelectedPlacementId ??
			DEFAULT_PIPEWARE_EDITOR_STATE.pipewareSelectedPlacementId,
	);
	const pipewareActiveFeatureConfig = signal(
		resolvePipewareFeatureConfig(initialConfig, defaults),
	);
	const pipewareHoverTile = signal(null);

	let pipewareDragSession = null;

	const pipewareSelectedPlacement = $(() =>
		getPipewarePlacementById(
			pipewarePlacements.value,
			pipewareSelectedPlacementId.value,
		),
	);
	const pipewareSelectedPlacementLabel = $(() =>
		getPipewarePlacementStatusLabel(pipewareSelectedPlacement.value),
	);
	const pipewareActiveFeatureType = $(
		() => pipewareActiveFeatureConfig.value.type,
	);
	const pipewarePreviewPlacement = $(() => {
		const hoverTile = pipewareHoverTile.value;
		const placements = pipewarePlacements.value;
		const activeFeatureConfig = pipewareActiveFeatureConfig.value;
		const boardWidth = width.value;
		const boardHeight = height.value;
		if (!hoverTile) return null;
		return createPipewarePlacementPreview(
			placements,
			activeFeatureConfig,
			hoverTile.centerX,
			hoverTile.centerY,
			boardWidth,
			boardHeight,
		);
	});

	watch(() => {
		const selectedPlacementId = pipewareSelectedPlacementId.value;
		if (!selectedPlacementId) return;
		if (pipewareSelectedPlacement.value) return;
		pipewareSelectedPlacementId.value = null;
	});

	const setPipewarePlacementsState = (
		nextPlacements,
		nextSelectedPlacementId = pipewareSelectedPlacementId.value,
	) => {
		pipewarePlacements.value = nextPlacements;
		pipewareSelectedPlacementId.value = nextPlacements.some(
			(placement) => placement.id === nextSelectedPlacementId,
		)
			? nextSelectedPlacementId
			: null;
	};

	const syncBoardSize = (nextWidth, nextHeight) => {
		width.value = nextWidth;
		height.value = nextHeight;
		const nextPlacements = ensurePipewarePlacements(
			pipewarePlacements.value,
			nextWidth,
			nextHeight,
			tileSizeValue.value,
		);
		setPipewarePlacementsState(nextPlacements);
	};

	const applyConfig = (config, defaults) => {
		width.value = config.width ?? defaults.width;
		height.value = config.height ?? defaults.height;
		tileSizeValue.value = config.tileSizeValue ?? defaults.tileSizeValue;
		pipewareBoardThicknessValue.value = resolvePipewareBoardThickness(
			config,
			defaults,
		);
		circleSegmentsValue.value =
			config.circleSegmentsValue ?? defaults.circleSegmentsValue;
		pipewarePlacements.value = ensurePipewarePlacements(
			config.pipewarePlacements ??
			defaults.pipewarePlacements ??
				DEFAULT_PIPEWARE_EDITOR_STATE.pipewarePlacements,
			width.value,
			height.value,
			tileSizeValue.value,
		);
		pipewareSelectedPlacementId.value =
			config.pipewareSelectedPlacementId ??
			defaults.pipewareSelectedPlacementId ??
			DEFAULT_PIPEWARE_EDITOR_STATE.pipewareSelectedPlacementId;
		pipewareActiveFeatureConfig.value = resolvePipewareFeatureConfig(
			config,
			defaults,
		);
	};

	const getConfigState = () => ({
		width: width.value,
		height: height.value,
		tileSizeValue: tileSizeValue.value,
		pipewareBoardThicknessValue: pipewareBoardThicknessValue.value,
		circleSegmentsValue: circleSegmentsValue.value,
		pipewarePlacements: pipewarePlacements.value,
		pipewareSelectedPlacementId: pipewareSelectedPlacementId.value,
		pipewareActiveFeatureConfig: pipewareActiveFeatureConfig.value,
	});

	const buildExportConfig = () => ({
		width: width.value,
		height: height.value,
		tileSizeValue: tileSizeValue.value,
		pipewareBoardThicknessValue: pipewareBoardThicknessValue.value,
		circleSegmentsValue: circleSegmentsValue.value,
		pipewarePlacements: pipewarePlacements.value,
	});

	const updateSize = (nextW, nextH, offsetX = 0, offsetY = 0) => {
		const nw = Math.max(1, nextW);
		const nh = Math.max(1, nextH);
		syncBoardSize(nw, nh);
		if (!offsetX && !offsetY) return;
		const shifted = pipewarePlacements.value.map((placement) => ({
			...placement,
			anchor: {
				tx: placement.anchor.tx + offsetX,
				ty: placement.anchor.ty + offsetY,
			},
		}));
		setPipewarePlacementsState(
			ensurePipewarePlacements(shifted, nw, nh, tileSizeValue.value),
			pipewareSelectedPlacementId.value,
		);
	};

	const getPipewarePlacementCenterFromAction = (action) => {
		const sceneX = Number(action?.sceneX);
		const sceneY = Number(action?.sceneY);
		if (Number.isFinite(sceneX) && Number.isFinite(sceneY)) {
			return {
				centerX: (sceneX - editorPad) / tileSize,
				centerY: (sceneY - editorPad) / tileSize,
			};
		}
		return {
			centerX: Number(action?.tx ?? 0) + 0.5,
			centerY: Number(action?.ty ?? 0) + 0.5,
		};
	};

	const placePipewareAt = (action) => {
		const center = getPipewarePlacementCenterFromAction(action);
		const nextPlacements = placePipewarePlacement(
			pipewarePlacements.value,
			pipewareActiveFeatureConfig.value,
			center.centerX,
			center.centerY,
			width.value,
			height.value,
		);
		if (!nextPlacements) return;
		const nextPlacement = nextPlacements[nextPlacements.length - 1];
		setPipewarePlacementsState(nextPlacements, nextPlacement?.id ?? null);
		if (nextPlacement) {
			pipewareActiveFeatureConfig.value =
				createPipewareFeatureConfigFromPlacement(nextPlacement);
		}
		pipewareHoverTile.value = null;
	};

	const rotatePipewarePlacementFromCenter = (placementId) => {
		const placement = getPipewarePlacementById(
			pipewarePlacements.value,
			placementId,
		);
		if (!placement) return false;
		const bounds = getPipewarePlacementBounds(placement);
		const centerX = bounds.tx + bounds.width / 2;
		const centerY = bounds.ty + bounds.height / 2;

		for (const turns of [-1, -2, -3]) {
			const rotatedBase = normalizePipewarePlacement({
				...placement,
				rotation: normalizePipewareRotation(placement.rotation + turns * 90),
				edgeCuts: rotatePipewareEdgeCuts(
					placement.edgeCuts,
					bounds.width,
					bounds.height,
					turns,
				),
			});
			const rotatedBounds = getPipewarePlacementBounds(rotatedBase);
			const anchorCandidates = getCenterRotationAnchorCandidates(
				rotatedBounds,
				centerX,
				centerY,
				bounds,
				width.value,
				height.value,
			);
			for (const anchor of anchorCandidates) {
				const candidate = normalizePipewarePlacement({
					...rotatedBase,
					anchor: {
						tx: anchor.tx,
						ty: anchor.ty,
					},
				});
				if (
					!pipewareBoundsOverlap(bounds, getPipewarePlacementBounds(candidate))
				) {
					continue;
				}
				const nextPlacements = replacePipewarePlacement(
					pipewarePlacements.value,
					candidate,
					width.value,
					height.value,
					tileSizeValue.value,
				);
				if (!nextPlacements) continue;
				setPipewarePlacementsState(nextPlacements, placementId);
				pipewareActiveFeatureConfig.value =
					createPipewareFeatureConfigFromPlacement(candidate);
				return true;
			}
		}
		return false;
	};

	const rotateSelectedPipewarePlacement = () => {
		const placement = pipewareSelectedPlacement.value;
		if (!placement) return false;
		return rotatePipewarePlacementFromCenter(placement.id);
	};

	const rotatePipewarePreviewConfig = () => {
		const previewPlacement = pipewarePreviewPlacement.value;
		const currentRotation =
			previewPlacement?.rotation ?? pipewareActiveFeatureConfig.value.rotation;
		pipewareActiveFeatureConfig.value = updatePipewareFeatureConfig(
			pipewareActiveFeatureConfig.value,
			{ rotation: normalizePipewareRotation(currentRotation - 90) },
		);
	};

	const rotateActivePipewarePart = () => {
		if (pipewareSelectedPlacement.value) {
			rotateSelectedPipewarePlacement();
			return;
		}
		rotatePipewarePreviewConfig();
	};

	const selectOrRotatePipewarePlacement = (placementId) => {
		const placement = getPipewarePlacementById(
			pipewarePlacements.value,
			placementId,
		);
		if (!placement) return;
		if (pipewareSelectedPlacementId.value !== placementId) {
			pipewareSelectedPlacementId.value = placementId;
			pipewareActiveFeatureConfig.value =
				createPipewareFeatureConfigFromPlacement(placement);
			return;
		}
		rotatePipewarePlacementFromCenter(placementId);
	};

	const beginPipewareDrag = (action) => {
		pipewareHoverTile.value = null;
		if (action.type === "placement") {
			const placement = getPipewarePlacementById(
				pipewarePlacements.value,
				action.placementId,
			);
			if (!placement) return;
			pipewareDragSession = {
				kind: "move",
				placement,
				startSceneX: action.sceneX,
				startSceneY: action.sceneY,
			};
			return;
		}
		if (action.type === "resize") {
			const placement = getPipewarePlacementById(
				pipewarePlacements.value,
				action.placementId,
			);
			if (!placement) return;
			pipewareDragSession = {
				kind: "resize",
				placement,
				handleSide: action.handleSide,
				startSceneX: action.sceneX,
				startSceneY: action.sceneY,
			};
		}
		if (action.type === "param-handle") {
			const placement = getPipewarePlacementById(
				pipewarePlacements.value,
				action.placementId,
			);
			if (!placement || !action.paramKey) return;
			pipewareDragSession = {
				kind: "param",
				placement,
				paramKey: action.paramKey,
				paramSide: action.paramSide,
				normalX: Number(action.normalX) || 0,
				normalY: Number(action.normalY) || 0,
				startValue:
					placement.params?.[action.paramKey] ?? placement.params?.widthUnits ?? 1,
				startSceneX: action.sceneX,
				startSceneY: action.sceneY,
			};
		}
	};

	const updatePipewareDrag = (action) => {
		if (!pipewareDragSession) return;
		if (pipewareDragSession.kind === "move") {
			const deltaTx = Math.round(action.sceneDX / tileSize);
			const deltaTy = Math.round(action.sceneDY / tileSize);
			const candidate = normalizePipewarePlacement({
				...pipewareDragSession.placement,
				anchor: {
					tx: pipewareDragSession.placement.anchor.tx + deltaTx,
					ty: pipewareDragSession.placement.anchor.ty + deltaTy,
				},
			});
			const nextPlacements = replacePipewarePlacement(
				pipewarePlacements.value,
				candidate,
				width.value,
				height.value,
				tileSizeValue.value,
			);
			if (!nextPlacements) return;
			setPipewarePlacementsState(nextPlacements, candidate.id);
			return;
		}

		if (pipewareDragSession.kind === "param") {
			const projectedDelta =
				(action.sceneDX / tileSize) * pipewareDragSession.normalX +
				(action.sceneDY / tileSize) * pipewareDragSession.normalY;
			const deltaUnits = Math.round(projectedDelta);
			if (!deltaUnits) return;
			const nextPlacements = updatePipewarePlacementParams(
				pipewarePlacements.value,
				pipewareDragSession.placement.id,
				getPipewareFixedBoundsParamPatch(
					pipewareDragSession.placement,
					pipewareDragSession.paramKey,
					pipewareDragSession.startValue + deltaUnits,
					pipewareDragSession.paramSide,
				),
				width.value,
				height.value,
				tileSizeValue.value,
			);
			if (!nextPlacements) return;
			const nextPlacement = getPipewarePlacementById(
				nextPlacements,
				pipewareDragSession.placement.id,
			);
			setPipewarePlacementsState(nextPlacements, pipewareDragSession.placement.id);
			if (nextPlacement) {
				pipewareActiveFeatureConfig.value =
					createPipewareFeatureConfigFromPlacement(nextPlacement);
			}
			return;
		}

		if (pipewareDragSession.kind !== "resize") return;
		const placement = pipewareDragSession.placement;
		if (placement.type === "I") {
			const rotation = normalizePipewareRotation(placement.rotation);
			const bounds = getPipewarePlacementBounds(placement);
			const horizontal = rotation % 180 === 0;
			const deltaX = Math.round(action.sceneDX / tileSize);
			const deltaY = Math.round(action.sceneDY / tileSize);
			let nextLength = placement.params?.lengthUnits ?? 1;
			let nextWidthUnits = placement.params?.widthUnits ?? 1;
			let nextAnchorTx = placement.anchor.tx;
			let nextAnchorTy = placement.anchor.ty;

			if (horizontal) {
				if (pipewareDragSession.handleSide === "E") {
					nextLength += deltaX;
				}
				if (pipewareDragSession.handleSide === "W") {
					nextLength -= deltaX;
					nextAnchorTx = placement.anchor.tx + (bounds.width - Math.max(1, nextLength));
				}
				if (pipewareDragSession.handleSide === "S") {
					nextWidthUnits += deltaY;
				}
				if (pipewareDragSession.handleSide === "N") {
					nextWidthUnits -= deltaY;
					nextAnchorTy =
						placement.anchor.ty + (bounds.height - Math.max(1, nextWidthUnits));
				}
			} else {
				if (pipewareDragSession.handleSide === "S") {
					nextLength += deltaY;
				}
				if (pipewareDragSession.handleSide === "N") {
					nextLength -= deltaY;
					nextAnchorTy = placement.anchor.ty + (bounds.height - Math.max(1, nextLength));
				}
				if (pipewareDragSession.handleSide === "E") {
					nextWidthUnits += deltaX;
				}
				if (pipewareDragSession.handleSide === "W") {
					nextWidthUnits -= deltaX;
					nextAnchorTx =
						placement.anchor.tx + (bounds.width - Math.max(1, nextWidthUnits));
				}
			}
			nextLength = Math.max(1, nextLength);
			nextWidthUnits = Math.max(1, nextWidthUnits);
			const nextPlacement = {
				...placement,
				anchor: {
					tx: nextAnchorTx,
					ty: nextAnchorTy,
				},
				params: {
					...placement.params,
					lengthUnits: nextLength,
					widthUnits: nextWidthUnits,
				},
			};
			nextPlacement.edgeCuts = remapPipewareEdgeCutsForPlacementChange(
				placement.edgeCuts,
				placement,
				nextPlacement,
				pipewareDragSession.handleSide,
			);
			const candidate = normalizePipewarePlacement(nextPlacement);
			const nextPlacements = replacePipewarePlacement(
				pipewarePlacements.value,
				candidate,
				width.value,
				height.value,
				tileSizeValue.value,
			);
			if (!nextPlacements) return;
			setPipewarePlacementsState(nextPlacements, candidate.id);
			pipewareActiveFeatureConfig.value =
				createPipewareFeatureConfigFromPlacement(candidate);
			return;
		}

		if (placement.type !== "L") {
			const rotationTurns = normalizePipewareRotation(placement.rotation) / 90;
			const bounds = getPipewarePlacementBounds(placement);
			const deltaX = Math.round(action.sceneDX / tileSize);
			const deltaY = Math.round(action.sceneDY / tileSize);
			const deltaUnits = getPipewareResizeDeltaForWorldSide(
				pipewareDragSession.handleSide,
				deltaX,
				deltaY,
			);
			if (!deltaUnits) return;
			const baseSide = rotatePipewareCardinalSideCCWNTimes(
				pipewareDragSession.handleSide,
				(4 - rotationTurns) % 4,
			);
			const patch = getPipewareGenericResizeParamPatch(
				placement,
				baseSide,
				deltaUnits,
			);
			if (!patch) return;
			let nextAnchorTx = placement.anchor.tx;
			let nextAnchorTy = placement.anchor.ty;
			if (pipewareDragSession.handleSide === "W") {
				nextAnchorTx = placement.anchor.tx + deltaX;
			}
			if (pipewareDragSession.handleSide === "N") {
				nextAnchorTy = placement.anchor.ty + deltaY;
			}
			const nextPlacement = {
				...placement,
				anchor: {
					tx: nextAnchorTx,
					ty: nextAnchorTy,
				},
				params: {
					...placement.params,
					...patch,
				},
			};
			nextPlacement.edgeCuts = remapPipewareEdgeCutsForPlacementChange(
				placement.edgeCuts,
				placement,
				nextPlacement,
				pipewareDragSession.handleSide,
			);
			const candidate = normalizePipewarePlacement(nextPlacement);
			if (
				!pipewareBoundsOverlap(bounds, getPipewarePlacementBounds(candidate)) &&
				(pipewareDragSession.handleSide === "W" ||
					pipewareDragSession.handleSide === "N")
			) {
				return;
			}
			const nextPlacements = replacePipewarePlacement(
				pipewarePlacements.value,
				candidate,
				width.value,
				height.value,
				tileSizeValue.value,
			);
			if (!nextPlacements) return;
			setPipewarePlacementsState(nextPlacements, candidate.id);
			pipewareActiveFeatureConfig.value =
				createPipewareFeatureConfigFromPlacement(candidate);
			return;
		}

		const rotation = normalizePipewareRotation(placement.rotation);
		const bounds = getPipewarePlacementBounds(placement);
		const deltaX = Math.round(action.sceneDX / tileSize);
		const deltaY = Math.round(action.sceneDY / tileSize);
		const currentLengthUnitsX = placement.params?.lengthUnitsX ?? 0;
		const currentLengthUnitsY = placement.params?.lengthUnitsY ?? 0;
		const currentWidthUnits = placement.params?.widthUnits ?? 1;
		let nextWidth = bounds.width;
		let nextHeight = bounds.height;
		let nextAnchorTx = placement.anchor.tx;
		let nextAnchorTy = placement.anchor.ty;
		if (pipewareDragSession.handleSide === "E") nextWidth = bounds.width + deltaX;
		if (pipewareDragSession.handleSide === "W") {
			nextWidth = bounds.width - deltaX;
			nextAnchorTx = placement.anchor.tx + (bounds.width - nextWidth);
		}
		if (pipewareDragSession.handleSide === "S") nextHeight = bounds.height + deltaY;
		if (pipewareDragSession.handleSide === "N") {
			nextHeight = bounds.height - deltaY;
			nextAnchorTy = placement.anchor.ty + (bounds.height - nextHeight);
		}
		const turnSpan = (placement.params?.addedRadiusUnits ?? 0) + 1;
		const minArcBounds = turnSpan + currentWidthUnits - 1;
		if (currentLengthUnitsX === 0 && currentLengthUnitsY === 0) {
			const nextBoundsSpan = Math.max(currentWidthUnits, nextWidth, nextHeight);
			const nextTurnSpan = Math.max(1, nextBoundsSpan - currentWidthUnits + 1);
			const nextBoundsSize = nextTurnSpan + currentWidthUnits - 1;
			if (pipewareDragSession.handleSide === "W") {
				nextAnchorTx = placement.anchor.tx + (bounds.width - nextBoundsSize);
			}
			if (pipewareDragSession.handleSide === "N") {
				nextAnchorTy = placement.anchor.ty + (bounds.height - nextBoundsSize);
			}
			const nextPlacement = {
				...placement,
				anchor: {
					tx: nextAnchorTx,
					ty: nextAnchorTy,
				},
				params: {
					...placement.params,
					lengthUnitsX: 0,
					lengthUnitsY: 0,
					addedRadiusUnits: nextTurnSpan - 1,
					widthUnits: currentWidthUnits,
				},
			};
			nextPlacement.edgeCuts = remapPipewareEdgeCutsForPlacementChange(
				placement.edgeCuts,
				placement,
				nextPlacement,
				pipewareDragSession.handleSide,
			);
			const candidate = normalizePipewarePlacement(nextPlacement);
			const nextPlacements = replacePipewarePlacement(
				pipewarePlacements.value,
				candidate,
				width.value,
				height.value,
				tileSizeValue.value,
			);
			if (!nextPlacements) return;
			setPipewarePlacementsState(nextPlacements, candidate.id);
			pipewareActiveFeatureConfig.value =
				createPipewareFeatureConfigFromPlacement(candidate);
			return;
		}
		nextWidth = Math.max(minArcBounds, nextWidth);
		nextHeight = Math.max(minArcBounds, nextHeight);
		if (pipewareDragSession.handleSide === "W") {
			nextAnchorTx = placement.anchor.tx + (bounds.width - nextWidth);
		}
		if (pipewareDragSession.handleSide === "N") {
			nextAnchorTy = placement.anchor.ty + (bounds.height - nextHeight);
		}
		const baseWidth = rotation % 180 === 0 ? nextWidth : nextHeight;
		const baseHeight = rotation % 180 === 0 ? nextHeight : nextWidth;
		const nextPlacement = {
			...placement,
			anchor: {
				tx: nextAnchorTx,
				ty: nextAnchorTy,
			},
			params: {
				...placement.params,
				lengthUnitsX: Math.max(0, baseWidth - turnSpan - currentWidthUnits + 1),
				lengthUnitsY: Math.max(0, baseHeight - turnSpan - currentWidthUnits + 1),
				widthUnits: currentWidthUnits,
			},
		};
		nextPlacement.edgeCuts = remapPipewareEdgeCutsForPlacementChange(
			placement.edgeCuts,
			placement,
			nextPlacement,
			pipewareDragSession.handleSide,
		);
		const candidate = normalizePipewarePlacement(nextPlacement);
		const nextPlacements = replacePipewarePlacement(
			pipewarePlacements.value,
			candidate,
			width.value,
			height.value,
			tileSizeValue.value,
		);
		if (!nextPlacements) return;
		setPipewarePlacementsState(nextPlacements, candidate.id);
		pipewareActiveFeatureConfig.value =
			createPipewareFeatureConfigFromPlacement(candidate);
	};

	const endPipewareDrag = () => {
		pipewareDragSession = null;
	};

	const togglePipewareEdgeCut = (placementId, edgeKey, edgeKeys = null) => {
		const nextPlacements = togglePipewarePlacementEdgeCut(
			pipewarePlacements.value,
			placementId,
			edgeKey,
			edgeKeys,
			tileSizeValue.value,
		);
		if (!nextPlacements) return;
		setPipewarePlacementsState(nextPlacements, placementId);
	};

	const updatePipewareHover = (targetAction) => {
		if (targetAction?.type !== "place-tile") {
			pipewareHoverTile.value = null;
			return;
		}
		const center = getPipewarePlacementCenterFromAction(targetAction);
		pipewareHoverTile.value = {
			tx: targetAction.tx,
			ty: targetAction.ty,
			centerX: center.centerX,
			centerY: center.centerY,
		};
	};

	const setPipewareFeatureType = (type) => {
		const nextType = normalizePipewareFeatureType(type);
		const selectedPlacement = pipewareSelectedPlacement.value;
		if (selectedPlacement && selectedPlacement.type === nextType) return;
		if (selectedPlacement) {
			pipewareSelectedPlacementId.value = null;
		}
		pipewareActiveFeatureConfig.value = updatePipewareFeatureConfig(
			pipewareActiveFeatureConfig.value,
			{ type: nextType },
		);
	};

	const updatePipewareFeatureParam = (key, rawValue) => {
		const selectedPlacement = pipewareSelectedPlacement.value;
		if (!selectedPlacement) {
			const nextConfig = updatePipewareFeatureConfig(
				pipewareActiveFeatureConfig.value,
				{ params: { [key]: rawValue } },
			);
			if (pipewareFeatureGeometrySticksOut(nextConfig.type, nextConfig.params)) {
				return;
			}
			pipewareActiveFeatureConfig.value = nextConfig;
			return;
		}
		const nextPlacements = updatePipewarePlacementParams(
			pipewarePlacements.value,
			selectedPlacement.id,
			getPipewareFixedBoundsParamPatch(selectedPlacement, key, rawValue),
			width.value,
			height.value,
			tileSizeValue.value,
		);
		if (!nextPlacements) return;
		const nextPlacement = getPipewarePlacementById(
			nextPlacements,
			selectedPlacement.id,
		);
		setPipewarePlacementsState(nextPlacements, selectedPlacement.id);
		if (nextPlacement) {
			pipewareActiveFeatureConfig.value =
				createPipewareFeatureConfigFromPlacement(nextPlacement);
		}
	};

	const deselectPipewarePlacement = () => {
		pipewareSelectedPlacementId.value = null;
	};

	const removeSelectedPipewarePlacement = () => {
		const placementId = pipewareSelectedPlacementId.value;
		if (!placementId) return;
		const nextPlacements = removePipewarePlacement(
			pipewarePlacements.value,
			placementId,
		);
		if (!nextPlacements) return;
		setPipewarePlacementsState(nextPlacements, null);
	};

	const performEditorAction = (action) => {
		if (!action?.type) return;
		if (action.phase === "start") {
			beginPipewareDrag(action);
			return;
		}
		if (action.phase === "move") {
			updatePipewareDrag(action);
			return;
		}
		if (action.phase === "end") {
			updatePipewareDrag(action);
			endPipewareDrag();
			return;
		}
		if (action.phase === "cancel") {
			endPipewareDrag();
			return;
		}
		switch (action.type) {
			case "hover":
				updatePipewareHover(action.targetAction);
				return;
			case "place-tile":
				placePipewareAt(action);
				return;
			case "empty-space":
				deselectPipewarePlacement();
				return;
			case "placement":
				selectOrRotatePipewarePlacement(action.placementId);
				return;
			case "resize":
				return;
			case "edge-cut":
				togglePipewareEdgeCut(
					action.placementId,
					action.edgeKey,
					action.edgeKeys,
				);
				return;
			case "remove-placement": {
				const nextPlacements = removePipewarePlacement(
					pipewarePlacements.value,
					action.placementId,
				);
				if (!nextPlacements) return;
				setPipewarePlacementsState(nextPlacements, null);
				return;
			}
			case "remove-selected":
				removeSelectedPipewarePlacement();
				return;
			case "rotate-active":
				rotateActivePipewarePart();
				return;
			case "top-add":
				updateSize(width.value, height.value + 1, 0, 1);
				return;
			case "top-remove":
				updateSize(width.value, height.value - 1, 0, -1);
				return;
			case "left-add":
				updateSize(width.value + 1, height.value, 1, 0);
				return;
			case "left-remove":
				updateSize(width.value - 1, height.value, -1, 0);
				return;
			case "right-add":
				updateSize(width.value + 1, height.value);
				return;
			case "right-remove":
				updateSize(width.value - 1, height.value);
				return;
			case "bottom-add":
				updateSize(width.value, height.value + 1);
				return;
			case "bottom-remove":
				updateSize(width.value, height.value - 1);
				return;
			default:
				return;
		}
	};

	const readEditorAction = (target) => {
		const actionEl = target?.closest?.("[data-editor-action]");
		if (!actionEl) return null;

		const type = actionEl.getAttribute("data-editor-action");
		if (!type) return null;
		if (type === "place-tile") {
			return {
				type,
				tx: Number(actionEl.getAttribute("data-tx")),
				ty: Number(actionEl.getAttribute("data-ty")),
			};
		}
		if (type === "placement") {
			const placementId = actionEl.getAttribute("data-placement-id");
			const action = {
				type,
				placementId,
				tx: Number(actionEl.getAttribute("data-tx")),
				ty: Number(actionEl.getAttribute("data-ty")),
			};
			if (placementId === pipewareSelectedPlacementId.value) {
				action.dragBehavior = "pipeware-placement";
			}
			return action;
		}
		if (type === "resize") {
			return {
				type,
				placementId: actionEl.getAttribute("data-placement-id"),
				handleSide: actionEl.getAttribute("data-handle-side"),
				dragBehavior: "pipeware-resize",
			};
		}
		if (type === "param-handle") {
			return {
				type,
				placementId: actionEl.getAttribute("data-placement-id"),
				paramKey: actionEl.getAttribute("data-param-key"),
				paramSide: actionEl.getAttribute("data-param-side"),
				normalX: Number(actionEl.getAttribute("data-param-normal-x")),
				normalY: Number(actionEl.getAttribute("data-param-normal-y")),
				dragBehavior: "pipeware-param",
			};
		}
		if (type === "edge-cut") {
			return {
				type,
				placementId: actionEl.getAttribute("data-placement-id"),
				edgeKey: actionEl.getAttribute("data-edge-key"),
				edgeKeys: (actionEl.getAttribute("data-edge-keys") ?? "")
					.split("|")
					.filter(Boolean),
			};
		}
		return { type };
	};

	return Object.freeze({
		signals: Object.freeze({
			width,
			height,
			tileSizeValue,
			pipewareBoardThicknessValue,
			circleSegmentsValue,
			pipewarePlacements,
			pipewareSelectedPlacementId,
			pipewareActiveFeatureConfig,
			pipewareActiveFeatureType,
			pipewarePreviewPlacement,
			pipewareSelectedPlacement,
			pipewareSelectedPlacementLabel,
		}),
		applyConfig,
		getConfigState,
		buildExportConfig,
		syncBoardSize,
		updateSize,
		configPanelActions: Object.freeze({
			updateSize,
			setPipewareFeatureType,
			updatePipewareFeatureParam,
			removeSelectedPipewarePlacement,
			deselectPipewarePlacement,
		}),
		editorActions: Object.freeze({
			readAction: readEditorAction,
			performAction: performEditorAction,
		}),
	});
}
