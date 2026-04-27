import { $ } from "refui";
import { OPEN_GRID_BOARD_EDITOR_2D_RENDERERS } from "./Editor2DRenderers.jsx";

const EDITOR_2D_RESIZE_BUTTON_OFFSET = 20;

function diamondPath(x, y, r) {
	return `M ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} L ${x - r} ${y} Z`;
}

function squareTile(x, y, size) {
	return { x: x - size / 2, y: y - size / 2, w: size, h: size };
}

function rectPath(x, y, w, h) {
	return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
}

export function createOpenGridBoardEditor2D(context) {
	const { app, partController } = context;
	const { constants, signals: appSignals } = app;
	const { resolvedTheme } = appSignals;
	const { signals, helpers, editorActions: openGridActions } = partController;
	const { width, height, maskGrid, topo } = signals;
	const {
		gridSize,
		tileCoordToGrid,
		isNodePos,
		getMask,
		tileFill,
		nodeState,
	} = helpers;
	const {
		pad,
		tileSize,
		editor2DBoardMaterialClipId,
		editor2DNodeMaskId,
	} = constants.editor2D;

	const step = tileSize / 2;
	const half = tileSize / 2;
	const svgW = $(() => width.value * tileSize + pad * 2);
	const svgH = $(() => height.value * tileSize + pad * 2);
	const editor2DBoardFill = $(() =>
		resolvedTheme.value === "dark" ? "#f8fafc" : "#000000",
	);
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
	const toNodeXY = (gx, gy) => ({ x: pad + gx * step, y: pad + gy * step });
	const tiles = $(() => {
		const items = [];
		for (let ty = 0; ty < height.value; ty++) {
			for (let tx = 0; tx < width.value; tx++) {
				const { gx, gy } = tileCoordToGrid(tx, ty);
				items.push({ id: `${gx}-${gy}`, tx, ty, gx, gy });
			}
		}
		return items;
	});
	const nodes = $(() => {
		const items = [];
		const { gw, gh } = gridSize(width.value, height.value);
		const nodeKind = topo.value.nodeKind;
		if (!nodeKind) return items;

		for (let gy = 0; gy < gh; gy++) {
			const row = nodeKind[gy];
			if (!row) continue;
			for (let gx = 0; gx < gw; gx++) {
				if (!isNodePos(gx, gy)) continue;
				const kind = row[gx];
				if (kind !== "none" && kind !== "used") {
					items.push({ id: `${gx}-${gy}`, gx, gy });
				}
			}
		}
		return items;
	});
	const editor2DBoardMaterialPath = $(() => {
		const parts = [];
		for (const { tx, ty, gx, gy } of tiles.value) {
			if (!tileFill(getMask(maskGrid.value, gx, gy))) continue;
			const x = pad + tx * tileSize + half;
			const y = pad + ty * tileSize + half;
			const sq = squareTile(x, y, tileSize);
			parts.push(rectPath(sq.x, sq.y, sq.w, sq.h));
		}
		for (const { gx, gy } of nodes.value) {
			const kind = topo.value.nodeKind[gy]?.[gx] ?? "none";
			if (kind !== "inner" && kind !== "diag") continue;
			const { x, y } = toNodeXY(gx, gy);
			parts.push(diamondPath(x, y, 13));
		}
		return parts.join(" ");
	});
	const editor2DActiveTileInsetPath = $(() => {
		const parts = [];
		const border = 3;
		for (const { tx, ty, gx, gy } of tiles.value) {
			if (!tileFill(getMask(maskGrid.value, gx, gy))) continue;
			const x = pad + tx * tileSize + half;
			const y = pad + ty * tileSize + half;
			const sq = squareTile(x, y, tileSize);
			parts.push(
				rectPath(
					sq.x + border,
					sq.y + border,
					sq.w - border * 2,
					sq.h - border * 2,
				),
			);
		}
		return parts.join(" ");
	});
	const editor2DNodeOverlayPath = $(() => {
		const parts = [];
		for (const { gx, gy } of nodes.value) {
			const { x, y } = toNodeXY(gx, gy);
			parts.push(diamondPath(x, y, 13));
		}
		return parts.join(" ");
	});

	return Object.freeze({
		renderers: OPEN_GRID_BOARD_EDITOR_2D_RENDERERS,
		scene: Object.freeze({
			editor2DBoardMaterialClipId,
			editor2DNodeMaskId,
			editor2DBoardMaterialPath,
			editor2DActiveTileInsetPath,
			editor2DNodeOverlayPath,
			editor2DBoardFill,
			tiles,
			nodes,
			toNodeXY,
			topo,
			maskGrid,
			getMask,
			nodeState,
			svgW,
			svgH,
			pad,
			tileSize,
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
		actions: openGridActions,
	});
}
