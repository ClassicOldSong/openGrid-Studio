import { $, signal } from "refui";
import {
	applyPreset,
	buildRectangleMask,
	buildTrapezoidMask,
	cloneGrid,
	deriveTopology,
	getMask,
	gridSize,
	isNodePos,
	nodeState,
	resizeMask,
	sanitizeMask,
	tileCoordToGrid,
	tileFill,
	BITS,
} from "./model.js";

function clamp(v, lo, hi) {
	return Math.max(lo, Math.min(hi, v));
}

function clampNumberInput(raw, min, max = Infinity, fallback = min) {
	const value = Number(raw);
	if (!Number.isFinite(value)) return fallback;
	return clamp(value, min, max);
}

function clampIntegerInput(raw, min, max, fallback = min) {
	return Math.round(clampNumberInput(raw, min, max, fallback));
}

export function createOpenGridBoardController({ initialConfig, defaults }) {
	const width = signal(initialConfig.width ?? defaults.width);
	const height = signal(initialConfig.height ?? defaults.height);
	const top1Text = signal(initialConfig.top1Text ?? defaults.top1Text);
	const top2Text = signal(initialConfig.top2Text ?? defaults.top2Text);
	const fullOrLite = signal(initialConfig.fullOrLite ?? defaults.fullOrLite);
	const tileSizeValue = signal(initialConfig.tileSizeValue ?? defaults.tileSizeValue);
	const tileThicknessValue = signal(
		initialConfig.tileThicknessValue ?? defaults.tileThicknessValue,
	);
	const liteTileThicknessValue = signal(
		initialConfig.liteTileThicknessValue ?? defaults.liteTileThicknessValue,
	);
	const heavyTileThicknessValue = signal(
		initialConfig.heavyTileThicknessValue ?? defaults.heavyTileThicknessValue,
	);
	const heavyTileGapValue = signal(
		initialConfig.heavyTileGapValue ?? defaults.heavyTileGapValue,
	);
	const addAdhesiveBase = signal(
		initialConfig.addAdhesiveBase ?? defaults.addAdhesiveBase,
	);
	const adhesiveBaseThicknessValue = signal(
		initialConfig.adhesiveBaseThicknessValue ??
			defaults.adhesiveBaseThicknessValue,
	);
	const screwDiameterValue = signal(
		initialConfig.screwDiameterValue ?? defaults.screwDiameterValue,
	);
	const screwHeadDiameterValue = signal(
		initialConfig.screwHeadDiameterValue ?? defaults.screwHeadDiameterValue,
	);
	const screwHeadInsetValue = signal(
		initialConfig.screwHeadInsetValue ?? defaults.screwHeadInsetValue,
	);
	const screwHeadIsCountersunk = signal(
		initialConfig.screwHeadIsCountersunk ?? defaults.screwHeadIsCountersunk,
	);
	const screwHeadCountersunkDegreeValue = signal(
		initialConfig.screwHeadCountersunkDegreeValue ??
			defaults.screwHeadCountersunkDegreeValue,
	);
	const backsideScrewHole = signal(
		initialConfig.backsideScrewHole ?? defaults.backsideScrewHole,
	);
	const backsideScrewHeadDiameterShrinkValue = signal(
		initialConfig.backsideScrewHeadDiameterShrinkValue ??
			defaults.backsideScrewHeadDiameterShrinkValue,
	);
	const backsideScrewHeadInsetValue = signal(
		initialConfig.backsideScrewHeadInsetValue ??
			defaults.backsideScrewHeadInsetValue,
	);
	const backsideScrewHeadIsCountersunk = signal(
		initialConfig.backsideScrewHeadIsCountersunk ??
			defaults.backsideScrewHeadIsCountersunk,
	);
	const stackCountValue = signal(
		initialConfig.stackCountValue ?? defaults.stackCountValue,
	);
	const stackingMethod = signal(
		initialConfig.stackingMethod ?? defaults.stackingMethod,
	);
	const interfaceThicknessValue = signal(
		initialConfig.interfaceThicknessValue ?? defaults.interfaceThicknessValue,
	);
	const interfaceSeparationValue = signal(
		initialConfig.interfaceSeparationValue ?? defaults.interfaceSeparationValue,
	);
	const circleSegmentsValue = signal(
		initialConfig.circleSegmentsValue ?? defaults.circleSegmentsValue,
	);
	const maskGrid = signal(cloneGrid(initialConfig.maskGrid ?? defaults.maskGrid));

	const topo = $(() =>
		deriveTopology(maskGrid.value, width.value, height.value),
	);
	const exportGrid = $(() =>
		sanitizeMask(maskGrid.value, width.value, height.value),
	);

	const updateSize = (nextW, nextH, offsetX = 0, offsetY = 0) => {
		const nw = Math.max(1, nextW);
		const nh = Math.max(1, nextH);
		if (
			nw !== width.value ||
			nh !== height.value ||
			offsetX !== 0 ||
			offsetY !== 0
		) {
			maskGrid.value = resizeMask(
				maskGrid.value,
				width.value,
				height.value,
				nw,
				nh,
				offsetX,
				offsetY,
			);
			width.value = nw;
			height.value = nh;
			top1Text.value = String(
				clampIntegerInput(top1Text.value, 0, nw, 0),
			);
			top2Text.value = String(
				clampIntegerInput(top2Text.value, 0, nw, 0),
			);
		}
	};

	const applyTrapezoid = () => {
		maskGrid.value = buildTrapezoidMask(
			width.value,
			height.value,
			top1Text.value,
			top2Text.value,
		);
	};

	const applyHelper = (helperMode) => {
		maskGrid.value = applyPreset(
			maskGrid.value,
			width.value,
			height.value,
			helperMode,
		);
	};

	const toggleTile = (gx, gy) => {
		const next = cloneGrid(maskGrid.value);
		next[gy][gx] ^= BITS.TILE;
		maskGrid.value = next;
	};

	const cycleNode = (gx, gy) => {
		const kind = topo.value.nodeKind[gy][gx];
		if (kind === "none" || kind === "used") return;
		const next = cloneGrid(maskGrid.value);
		const raw = getMask(maskGrid.value, gx, gy);
		const current = nodeState(kind, raw);
		next[gy][gx] &= ~(BITS.HOLE | BITS.CHAMFER);

		if (kind === "outer") {
			if (current === "none") next[gy][gx] |= BITS.CHAMFER;
		} else {
			if (current === "none") next[gy][gx] |= BITS.CHAMFER;
			else if (current === "chamfer") next[gy][gx] |= BITS.HOLE;
		}
		maskGrid.value = next;
	};

	const performEditorAction = (action) => {
		if (!action?.type) return;
		switch (action.type) {
			case "tile":
				toggleTile(action.gx, action.gy);
				return;
			case "node":
				cycleNode(action.gx, action.gy);
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
		if (type === "tile" || type === "node") {
			return {
				type,
				gx: Number(actionEl.getAttribute("data-gx")),
				gy: Number(actionEl.getAttribute("data-gy")),
			};
		}
		return { type };
	};

	const applyConfig = (config, nextDefaults = defaults) => {
		width.value = config.width ?? nextDefaults.width;
		height.value = config.height ?? nextDefaults.height;
		top1Text.value = config.top1Text ?? nextDefaults.top1Text;
		top2Text.value = config.top2Text ?? nextDefaults.top2Text;
		fullOrLite.value = config.fullOrLite ?? nextDefaults.fullOrLite;
		tileSizeValue.value = config.tileSizeValue ?? nextDefaults.tileSizeValue;
		tileThicknessValue.value =
			config.tileThicknessValue ?? nextDefaults.tileThicknessValue;
		liteTileThicknessValue.value =
			config.liteTileThicknessValue ?? nextDefaults.liteTileThicknessValue;
		heavyTileThicknessValue.value =
			config.heavyTileThicknessValue ?? nextDefaults.heavyTileThicknessValue;
		heavyTileGapValue.value =
			config.heavyTileGapValue ?? nextDefaults.heavyTileGapValue;
		addAdhesiveBase.value =
			config.addAdhesiveBase ?? nextDefaults.addAdhesiveBase;
		adhesiveBaseThicknessValue.value =
			config.adhesiveBaseThicknessValue ??
			nextDefaults.adhesiveBaseThicknessValue;
		screwDiameterValue.value =
			config.screwDiameterValue ?? nextDefaults.screwDiameterValue;
		screwHeadDiameterValue.value =
			config.screwHeadDiameterValue ?? nextDefaults.screwHeadDiameterValue;
		screwHeadInsetValue.value =
			config.screwHeadInsetValue ?? nextDefaults.screwHeadInsetValue;
		screwHeadIsCountersunk.value =
			config.screwHeadIsCountersunk ?? nextDefaults.screwHeadIsCountersunk;
		screwHeadCountersunkDegreeValue.value =
			config.screwHeadCountersunkDegreeValue ??
			nextDefaults.screwHeadCountersunkDegreeValue;
		backsideScrewHole.value =
			config.backsideScrewHole ?? nextDefaults.backsideScrewHole;
		backsideScrewHeadDiameterShrinkValue.value =
			config.backsideScrewHeadDiameterShrinkValue ??
			nextDefaults.backsideScrewHeadDiameterShrinkValue;
		backsideScrewHeadInsetValue.value =
			config.backsideScrewHeadInsetValue ??
			nextDefaults.backsideScrewHeadInsetValue;
		backsideScrewHeadIsCountersunk.value =
			config.backsideScrewHeadIsCountersunk ??
			nextDefaults.backsideScrewHeadIsCountersunk;
		stackCountValue.value =
			config.stackCountValue ?? nextDefaults.stackCountValue;
		stackingMethod.value =
			config.stackingMethod ?? nextDefaults.stackingMethod;
		interfaceThicknessValue.value =
			config.interfaceThicknessValue ?? nextDefaults.interfaceThicknessValue;
		interfaceSeparationValue.value =
			config.interfaceSeparationValue ?? nextDefaults.interfaceSeparationValue;
		circleSegmentsValue.value =
			config.circleSegmentsValue ?? nextDefaults.circleSegmentsValue;
		maskGrid.value = cloneGrid(config.maskGrid ?? nextDefaults.maskGrid);
	};

	const getConfigState = () => ({
		width: width.value,
		height: height.value,
		top1Text: top1Text.value,
		top2Text: top2Text.value,
		fullOrLite: fullOrLite.value,
		tileSizeValue: tileSizeValue.value,
		tileThicknessValue: tileThicknessValue.value,
		liteTileThicknessValue: liteTileThicknessValue.value,
		heavyTileThicknessValue: heavyTileThicknessValue.value,
		heavyTileGapValue: heavyTileGapValue.value,
		addAdhesiveBase: addAdhesiveBase.value,
		adhesiveBaseThicknessValue: adhesiveBaseThicknessValue.value,
		screwDiameterValue: screwDiameterValue.value,
		screwHeadDiameterValue: screwHeadDiameterValue.value,
		screwHeadInsetValue: screwHeadInsetValue.value,
		screwHeadIsCountersunk: screwHeadIsCountersunk.value,
		screwHeadCountersunkDegreeValue: screwHeadCountersunkDegreeValue.value,
		backsideScrewHole: backsideScrewHole.value,
		backsideScrewHeadDiameterShrinkValue:
			backsideScrewHeadDiameterShrinkValue.value,
		backsideScrewHeadInsetValue: backsideScrewHeadInsetValue.value,
		backsideScrewHeadIsCountersunk: backsideScrewHeadIsCountersunk.value,
		stackCountValue: stackCountValue.value,
		stackingMethod: stackingMethod.value,
		interfaceThicknessValue: interfaceThicknessValue.value,
		interfaceSeparationValue: interfaceSeparationValue.value,
		circleSegmentsValue: circleSegmentsValue.value,
		maskGrid: maskGrid.value,
	});

	const buildExportConfig = () => ({
		width: width.value,
		height: height.value,
		exportGrid: exportGrid.value,
		fullOrLite: fullOrLite.value,
		tileSizeValue: tileSizeValue.value,
		tileThicknessValue: tileThicknessValue.value,
		liteTileThicknessValue: liteTileThicknessValue.value,
		heavyTileThicknessValue: heavyTileThicknessValue.value,
		heavyTileGapValue: heavyTileGapValue.value,
		addAdhesiveBase: addAdhesiveBase.value,
		adhesiveBaseThicknessValue: adhesiveBaseThicknessValue.value,
		screwDiameterValue: screwDiameterValue.value,
		screwHeadDiameterValue: screwHeadDiameterValue.value,
		screwHeadInsetValue: screwHeadInsetValue.value,
		screwHeadIsCountersunk: screwHeadIsCountersunk.value,
		screwHeadCountersunkDegreeValue: screwHeadCountersunkDegreeValue.value,
		backsideScrewHole: backsideScrewHole.value,
		backsideScrewHeadDiameterShrinkValue:
			backsideScrewHeadDiameterShrinkValue.value,
		backsideScrewHeadInsetValue: backsideScrewHeadInsetValue.value,
		backsideScrewHeadIsCountersunk: backsideScrewHeadIsCountersunk.value,
		backsideScrewHeadCountersunkDegreeValue:
			defaults.backsideScrewHeadCountersunkDegreeValue,
		stackCountValue: stackCountValue.value,
		stackingMethod: stackingMethod.value,
		interfaceThicknessValue: interfaceThicknessValue.value,
		interfaceSeparationValue: interfaceSeparationValue.value,
		circleSegmentsValue: circleSegmentsValue.value,
	});

	return Object.freeze({
		signals: Object.freeze({
			width,
			height,
			top1Text,
			top2Text,
			fullOrLite,
			tileSizeValue,
			tileThicknessValue,
			liteTileThicknessValue,
			heavyTileThicknessValue,
			heavyTileGapValue,
			addAdhesiveBase,
			adhesiveBaseThicknessValue,
			screwDiameterValue,
			screwHeadDiameterValue,
			screwHeadInsetValue,
			screwHeadIsCountersunk,
			screwHeadCountersunkDegreeValue,
			backsideScrewHole,
			backsideScrewHeadDiameterShrinkValue,
			backsideScrewHeadInsetValue,
			backsideScrewHeadIsCountersunk,
			stackCountValue,
			stackingMethod,
			interfaceThicknessValue,
			interfaceSeparationValue,
			circleSegmentsValue,
			maskGrid,
			topo,
		}),
		helpers: Object.freeze({
			gridSize,
			tileCoordToGrid,
			isNodePos,
			getMask,
			tileFill,
			nodeState,
		}),
		updateSize,
		configPanelActions: Object.freeze({
			updateSize,
			clampIntegerInput,
			clampNumberInput,
			applyTrapezoid,
			applyHelper,
		}),
		editorActions: Object.freeze({
			readAction: readEditorAction,
			performAction: performEditorAction,
		}),
		applyConfig,
		getConfigState,
		buildExportConfig,
	});
}
