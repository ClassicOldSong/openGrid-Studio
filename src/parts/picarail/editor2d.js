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

export function createPicaRailEditor2D(context) {
	const { partController } = context;
	const { signals, editorActions } = partController;
	const { resolvedTheme } = context.app.signals;
	const {
		openGridTileSizeValue,
		openGridTileLength,
		targetLength,
		picaTileCount,
		endExtension,
		picaRailLength,
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
	const targetLengthPreview = $(() => {
		const value = Number(targetLength.value);
		return Number.isFinite(value) ? value : 0;
	});
	const openGridTileSizePx = $(() =>
		Math.max(1, tileSizeInfo.value * PIXELS_PER_MILLIMETER),
	);
	const contentWidthPx = $(() =>
		Math.max(1, targetLengthPreview.value * PIXELS_PER_MILLIMETER),
	);
	const contentHeightPx = $(() =>
		Math.max(railWidthPx, openGridTileSizePx.value),
	);
	const railY = $(() => (contentHeightPx.value - railWidthPx) / 2);
	const contentTransform = $(() => `translate(${pad.value} ${pad.value})`);
	const svgW = $(() => contentWidthPx.value + pad.value * 2);
	const svgH = $(() => contentHeightPx.value + pad.value * 2);
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
	const railBodyPath = $(() => {
		const width = Math.max(0, picaRailLength.value * PIXELS_PER_MILLIMETER);
		const y = railY.value;
		return width > 0 ? `M 0 ${y} H ${width} V ${y + railWidthPx} H 0 Z` : "";
	});
	const railTopFlatPath = $(() => {
		const width = Math.max(0, picaRailLength.value * PIXELS_PER_MILLIMETER);
		const y = railY.value + (railWidthPx - topFlatWidthPx) / 2;
		return width > 0 ? `M 0 ${y} H ${width} V ${y + topFlatWidthPx} H 0 Z` : "";
	});
	const railShoulderPaths = $(() => {
		const width = Math.max(0, picaRailLength.value * PIXELS_PER_MILLIMETER);
		if (width <= 0) return [];
		const y = railY.value;
		const shoulderWidth = (railWidthPx - topFlatWidthPx) / 2;
		return [
			{
				id: `left:${width}:${y}:${shoulderWidth}`,
				path: `M 0 ${y} H ${width} V ${y + shoulderWidth} H 0 Z`,
			},
			{
				id: `right:${width}:${y}:${shoulderWidth}`,
				path: `M 0 ${y + railWidthPx - shoulderWidth} H ${width} V ${y + railWidthPx} H 0 Z`,
			},
		];
	});
	const railSlots = $(() => {
		const count = Math.max(0, Math.floor(picaTileCount.value));
		const extension = Math.max(0, endExtension.value) * PIXELS_PER_MILLIMETER;
		const tilePitchPx = tileWidthPx;
		const offsetPx = PICA_TILE_OFFSET * PIXELS_PER_MILLIMETER;
		const y = railY.value;
		const slots = [];
		for (let index = 0; index < count; index++) {
			const slotX = extension + index * tilePitchPx + offsetPx;
			slots.push({
				id: `${index}:${slotX}:${y}`,
				path: `M ${slotX} ${y} H ${slotX + slotWidthPx} V ${y + railWidthPx} H ${slotX} Z`,
			});
		}
		return slots;
	});
	return Object.freeze({
		renderers: PICARAIL_EDITOR_2D_RENDERERS,
		scene: Object.freeze({
			svgW,
			svgH,
			pad,
			contentTransform,
			svgTileWidth: tileWidthPx,
			svgGapWidth: slotWidthPx,
			svgTileHeight: railWidthPx,
			tileOffsetPx: PICA_TILE_OFFSET * PIXELS_PER_MILLIMETER,
			openGridTiles,
			railBodyPath,
			railTopFlatPath,
			railShoulderPaths,
			railSlots,
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
				resolvedTheme.value === "dark" ? "#08163b" : "#1e3a8a",
			),
			bodyStroke: $(() =>
				resolvedTheme.value === "dark" ? "#60a5fa" : "#2563eb",
			),
			gapStroke: $(() =>
				resolvedTheme.value === "dark" ? "#172554" : "#172554",
			),
			configuredTileSize: openGridTileSizeValue,
			tileSizeInfo,
			targetLengthPreview,
			pixelScale: PIXELS_PER_MILLIMETER,
		}),
		actions: Object.freeze({
			readAction,
			performAction,
		}),
	});
}
