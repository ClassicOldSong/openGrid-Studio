import { $ } from "refui";
import { PICARAIL_EDITOR_2D_RENDERERS } from "./Editor2DRenderers.jsx";
import {
	PICA_TILE_OFFSET,
	PICA_TILE_PITCH,
	PICA_TILE_SLOT_WIDTH,
	PICA_RAIL_TOP_FLAT_WIDTH,
	PICA_RAIL_TOP_WIDTH,
} from "./constants.js";

const PIXELS_PER_MILLIMETER = 6;
const EDITOR_2D_RESIZE_BUTTON_OFFSET = 18;

export function createPicaRailEditor2D(context) {
	const { partController } = context;
	const { signals, editorActions } = partController;
	const { resolvedTheme } = context.app.signals;
	const {
		openGridTileSizeValue,
		openGridTileLength,
		extendEnds,
		picaRailLength,
		screwHoleTiles,
	} = signals;
	const { readAction, performAction } = editorActions;

	const tileWidthPx = PICA_TILE_PITCH * PIXELS_PER_MILLIMETER;
	const railWidthPx = PICA_RAIL_TOP_WIDTH * PIXELS_PER_MILLIMETER;
	const topFlatWidthPx = PICA_RAIL_TOP_FLAT_WIDTH * PIXELS_PER_MILLIMETER;
	const slotWidthPx = PICA_TILE_SLOT_WIDTH * PIXELS_PER_MILLIMETER;
	const pad = $(() => context.app.constants.editor2D.pad);
	const tileSizeInfo = $(() => {
		const size = Number(openGridTileSizeValue.value);
		return Number.isFinite(size) ? size : 0;
	});
	const openGridTileSizePx = $(() =>
		Math.max(1, tileSizeInfo.value * PIXELS_PER_MILLIMETER),
	);
	const contentWidthPx = $(() =>
		Math.max(1, openGridTileLength.value * openGridTileSizePx.value),
	);
	const contentHeightPx = $(() =>
		Math.max(railWidthPx, openGridTileSizePx.value),
	);
	const railX = $(() =>
		Math.max(
			0,
			(contentWidthPx.value - picaRailLength.value * PIXELS_PER_MILLIMETER) / 2,
		),
	);
	const railY = $(() => (contentHeightPx.value - railWidthPx) / 2);
	const contentTransform = $(() => `translate(${pad.value} ${pad.value})`);
	const svgW = $(() => contentWidthPx.value + pad.value * 2);
	const svgH = $(() => contentHeightPx.value + pad.value * 2);
	const editor2DResizeButtonFill = $(() =>
		resolvedTheme.value === "dark" ? "#0f172a" : "#ffffff",
	);
	const editor2DResizeButtonStroke = $(() =>
		resolvedTheme.value === "dark" ? "#334155" : "#cbd5e1",
	);
	const editor2DResizeButtonText = $(() =>
		resolvedTheme.value === "dark" ? "#e2e8f0" : "#334155",
	);
	const editor2DControlInset = $(() => pad.value / 2 - 6);
	const editor2DLeftControlX = editor2DControlInset;
	const editor2DRightControlX = $(() => svgW.value - editor2DControlInset.value);
	const editor2DCenterY = $(() => svgH.value / 2);
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
	const openGridTiles = $(() => {
		const count = Math.max(0, Math.round(openGridTileLength.value));
		const tileSize = openGridTileSizePx.value;
		const tiles = [];
		for (let index = 0; index < count; index++) {
			tiles.push({
				id: `${index}:${tileSize}`,
				x: index * tileSize,
				y: 0,
				width: tileSize,
				height: tileSize,
			});
		}
		return tiles;
	});
	const tileHitTargets = $(() => openGridTiles.value.map((tile) => ({
		...tile,
		id: `hit:${tile.id}`,
		tileIndex: Number(tile.id.split(":")[0]),
	})));
	const railBodyPath = $(() => {
		const width = Math.max(0, picaRailLength.value * PIXELS_PER_MILLIMETER);
		const x = railX.value;
		const y = railY.value;
		return width > 0 ? `M ${x} ${y} H ${x + width} V ${y + railWidthPx} H ${x} Z` : "";
	});
	const railTopFlatPath = $(() => {
		const width = Math.max(0, picaRailLength.value * PIXELS_PER_MILLIMETER);
		const x = railX.value;
		const y = railY.value + (railWidthPx - topFlatWidthPx) / 2;
		return width > 0 ? `M ${x} ${y} H ${x + width} V ${y + topFlatWidthPx} H ${x} Z` : "";
	});
	const railShoulderPaths = $(() => {
		const width = Math.max(0, picaRailLength.value * PIXELS_PER_MILLIMETER);
		if (width <= 0) return [];
		const x = railX.value;
		const y = railY.value;
		const shoulderWidth = (railWidthPx - topFlatWidthPx) / 2;
		return [
			{
				id: `left:${x}:${width}:${y}:${shoulderWidth}`,
				path: `M ${x} ${y} H ${x + width} V ${y + shoulderWidth} H ${x} Z`,
			},
			{
				id: `right:${x}:${width}:${y}:${shoulderWidth}`,
				path: `M ${x} ${y + railWidthPx - shoulderWidth} H ${x + width} V ${y + railWidthPx} H ${x} Z`,
			},
		];
	});
	const railSlots = $(() => {
		const railLength = Math.max(0, picaRailLength.value);
		const count = Math.max(0, Math.floor(railLength / PICA_TILE_PITCH));
		const extension = (extendEnds.value
			? Math.max(0, (railLength - count * PICA_TILE_PITCH) / 2)
			: 0) * PIXELS_PER_MILLIMETER;
		const tilePitchPx = tileWidthPx;
		const offsetPx = PICA_TILE_OFFSET * PIXELS_PER_MILLIMETER;
		const x = railX.value;
		const y = railY.value;
		const slots = [];
		for (let index = 0; index < count; index++) {
			const slotX = x + extension + index * tilePitchPx + offsetPx;
			slots.push({
				id: `${index}:${slotX}:${y}`,
				path: `M ${slotX} ${y} H ${slotX + slotWidthPx} V ${y + railWidthPx} H ${slotX} Z`,
			});
		}
		return slots;
	});
	const screwHoleMarkers = $(() => {
		const tileSize = openGridTileSizePx.value;
		const centerY = contentHeightPx.value / 2;
		const radius = 7.1 * PIXELS_PER_MILLIMETER;
		return screwHoleTiles.value.map((tileIndex) => ({
			id: `hole:${tileIndex}:${tileSize}:${centerY}`,
			cx: tileIndex * tileSize + tileSize / 2,
			cy: centerY,
			r: radius,
		}));
	});
	return {
		renderers: PICARAIL_EDITOR_2D_RENDERERS,
		scene: {
			svgW,
			svgH,
			pad,
			contentTransform,
			svgTileWidth: tileWidthPx,
			svgGapWidth: slotWidthPx,
			svgTileHeight: railWidthPx,
			tileOffsetPx: PICA_TILE_OFFSET * PIXELS_PER_MILLIMETER,
			openGridTiles,
			tileHitTargets,
			railBodyPath,
			railTopFlatPath,
			railShoulderPaths,
			railSlots,
			screwHoleMarkers,
			openGridFill: $(() =>
				resolvedTheme.value === "dark" ? "#020617" : "#eef2ff",
			),
			openGridStroke: $(() =>
				resolvedTheme.value === "dark" ? "#1e293b" : "#cbd5e1",
			),
			bodyFill: $(() =>
				resolvedTheme.value === "dark" ? "#1e3a8a" : "#93c5fd",
			),
			shoulderFill: $(() =>
				resolvedTheme.value === "dark" ? "#1d4ed8" : "#60a5fa",
			),
			topFlatFill: $(() =>
				resolvedTheme.value === "dark" ? "#3b82f6" : "#bfdbfe",
			),
			gapFill: $(() =>
				resolvedTheme.value === "dark" ? "#08163b" : "#93c5fd",
			),
			bodyStroke: $(() =>
				resolvedTheme.value === "dark" ? "#60a5fa" : "#2563eb",
			),
			gapStroke: $(() =>
				resolvedTheme.value === "dark" ? "#172554" : "#172554",
			),
			screwHoleFill: $(() =>
				resolvedTheme.value === "dark" ? "#020617" : "#dbeafe",
			),
			pixelScale: PIXELS_PER_MILLIMETER,
		},
		sharedControls: {
			resize: {
				theme: {
					fill: editor2DResizeButtonFill,
					stroke: editor2DResizeButtonStroke,
					glyph: editor2DResizeButtonText,
				},
				controls: [
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
				],
			},
		},
		actions: {
			readAction,
			performAction,
		},
	};
}
