import { signal, $, watch, onDispose, If, nextTick } from "refui";
import ConfigPanel from "./components/ConfigPanel.jsx";
import PreviewPane from "./components/PreviewPane.jsx";
import { CopyScadModal, AboutModal } from "./components/AppModals.jsx";
import {
	MOBILE_FLOATING_LEFT_STYLE,
	MOBILE_FLOATING_RIGHT_STYLE,
	createAppShellClass,
	createConfigPanelBodyClass,
	createConfigPanelClass,
	createEditor2DViewportClass,
	createEditor2DViewportStyle,
	createExportButtonClass,
	createExportDropdownButtonClass,
	createExportMenuItemClass,
	createPreviewOptionClass,
	createThemeOptionClass,
} from "./ui-styles.js";

// --- Constants & Pure Utils ---

const BITS = {
	TILE: 1,
	HOLE: 2,
	CHAMFER: 4,
};

const STORAGE_KEY = "opengrid-mask-editor-config-v2";
const EXPORT_FORMAT_OPTIONS = [
	{
		value: "stl-binary",
		label: "STL",
		extension: "stl",
		mimeType: "model/stl",
	},
	{
		value: "stl-ascii",
		label: "ASCII STL",
		extension: "stl",
		mimeType: "model/stl",
	},
	{ value: "3mf", label: "3MF", extension: "3mf", mimeType: "model/3mf" },
];
const BOARD_DIMENSION_MIN = 1;
const TOP_COLUMN_MIN = 0;
const STACK_COUNT_MIN = 1;
const TILE_SIZE_MIN = Math.ceil(Math.sqrt(2.6 ** 2 * 2) + 4.2);
const MEASUREMENT_MIN = 0;
const POSITIVE_MEASUREMENT_MIN = 0.1;
const SEGMENTS_MIN = 3;
const COUNTERSINK_DEGREE_MIN = 1;
const MOBILE_LAYOUT_BREAKPOINT = 1200;
const MOBILE_LAYOUT_MEDIA_QUERY = `(max-width: ${MOBILE_LAYOUT_BREAKPOINT - 1}px)`;
const EDITOR_2D_MIN_ZOOM = 0.35;
const EDITOR_2D_MAX_ZOOM = 5;
const EDITOR_2D_DRAG_THRESHOLD = 6;
const EDITOR_2D_RESIZE_BUTTON_OFFSET = 20;
const EDITOR_2D_INITIAL_MAX_TILE_PX = 88;
const DEFAULT_CONFIG = {
	themeMode: "auto",
	exportFormat: "stl-binary",
	fullOrLite: "Full",
	tileSizeValue: 28,
	tileThicknessValue: 6.8,
	liteTileThicknessValue: 4,
	heavyTileThicknessValue: 13.8,
	heavyTileGapValue: 0.2,
	addAdhesiveBase: false,
	adhesiveBaseThicknessValue: 0.6,
	screwDiameterValue: 4.1,
	screwHeadDiameterValue: 7.2,
	screwHeadInsetValue: 1,
	screwHeadIsCountersunk: true,
	screwHeadCountersunkDegreeValue: 90,
	backsideScrewHole: true,
	backsideScrewHeadDiameterShrinkValue: 0,
	backsideScrewHeadInsetValue: 1,
	backsideScrewHeadIsCountersunk: true,
	backsideScrewHeadCountersunkDegreeValue: 90,
	stackCountValue: 1,
	stackingMethod: "Interface Layer",
	interfaceThicknessValue: 0.4,
	interfaceSeparationValue: 0.1,
	circleSegmentsValue: 64,
	width: 4,
	height: 4,
	top1Text: "0",
	top2Text: "0",
	maskGrid: buildRectangleMask(4, 4),
};

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

function getExportFormatMeta(format) {
	return (
		EXPORT_FORMAT_OPTIONS.find((option) => option.value === format) ??
		EXPORT_FORMAT_OPTIONS[0]
	);
}

function shortHash(text) {
	let hash = 2166136261;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}

function buildExportFilename(config, format) {
	const meta = getExportFormatMeta(format);
	const boardWidth = Math.max(0, (config.exportGrid?.[0]?.length ?? 1) - 1);
	const boardHeight = Math.max(0, (config.exportGrid?.length ?? 1) - 1);
	const effectiveStackCount = config.addAdhesiveBase
		? 1
		: Math.max(1, Number(config.stackCountValue) || 1);
	const boardType = String(config.fullOrLite || "board")
		.trim()
		.toLowerCase();
	const hash = shortHash(JSON.stringify(config));
	return `opengrid_${boardType}_${boardWidth}x${boardHeight}_stack${effectiveStackCount}_${hash}.${meta.extension}`;
}

function range(n) {
	return Array.from({ length: n }, (_, i) => i);
}

function gridSize(width, height) {
	return { gw: width * 2 + 1, gh: height * 2 + 1 };
}

function makeMaskGrid(width, height, fill = 0) {
	const { gw, gh } = gridSize(width, height);
	return Array.from({ length: gh }, () =>
		Array.from({ length: gw }, () => fill),
	);
}

function cloneGrid(grid) {
	return grid.map((row) => [...row]);
}

function isTilePos(x, y) {
	return x % 2 === 1 && y % 2 === 1;
}

function isNodePos(x, y) {
	return x % 2 === 0 && y % 2 === 0;
}

function tileCoordToGrid(x, y) {
	return { gx: x * 2 + 1, gy: y * 2 + 1 };
}

function getMask(grid, x, y) {
	return grid[y]?.[x] ?? 0;
}

function hasBit(v, bit) {
	return (v & bit) !== 0;
}

function tileFill(raw) {
	return hasBit(raw, BITS.TILE);
}

function clearNonTileBits(grid) {
	const next = cloneGrid(grid);
	for (let y = 0; y < next.length; y++) {
		for (let x = 0; x < next[0].length; x++) {
			if (isTilePos(x, y)) next[y][x] &= BITS.TILE;
			else next[y][x] = 0;
		}
	}
	return next;
}

function buildRectangleMask(width, height) {
	const grid = makeMaskGrid(width, height, 0);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const { gx, gy } = tileCoordToGrid(x, y);
			grid[gy][gx] |= BITS.TILE;
		}
	}
	return enableOuterCornerChamfers(grid, width, height);
}

function parseTopColumnInput(v) {
	const t = String(v).trim();
	if (t === "") return 0;
	const n = Number(t);
	return Number.isFinite(n) ? n : 0;
}

function buildTrapezoidMask(width, height, top1Raw, top2Raw) {
	const grid = makeMaskGrid(width, height, 0);
	const top1 = parseTopColumnInput(top1Raw);
	const top2 = parseTopColumnInput(top2Raw);
	const a = top1 <= 0 ? 0 : clamp(top1 - 1, 0, Math.max(0, width - 1));
	const b =
		top2 <= 0
			? Math.max(0, width - 1)
			: clamp(top2 - 1, 0, Math.max(0, width - 1));
	const leftTop = Math.min(a, b);
	const rightTop = Math.max(a, b);

	for (let y = 0; y < height; y++) {
		const t = height <= 1 ? 0 : y / (height - 1);
		const left = Math.round(leftTop * (1 - t));
		const right = Math.round(rightTop * (1 - t) + (width - 1) * t);
		for (let x = left; x <= right; x++) {
			const { gx, gy } = tileCoordToGrid(x, y);
			grid[gy][gx] |= BITS.TILE;
		}
	}

	return enableOuterCornerChamfers(grid, width, height);
}

function tileActive(grid, tx, ty) {
	if (tx < 0 || ty < 0) return false;
	const { gx, gy } = tileCoordToGrid(tx, ty);
	return hasBit(getMask(grid, gx, gy), BITS.TILE);
}

function deriveTopology(grid, width, height) {
	const { gw, gh } = gridSize(width, height);
	const nodeKind = Array.from({ length: gh }, () =>
		Array.from({ length: gw }, () => "none"),
	);
	const nodeDir = Array.from({ length: gh }, () =>
		Array.from({ length: gw }, () => null),
	);

	for (let gy = 0; gy < gh; gy++) {
		for (let gx = 0; gx < gw; gx++) {
			if (!isNodePos(gx, gy)) continue;

			const tx = gx / 2;
			const ty = gy / 2;
			const nw = tileActive(grid, tx - 1, ty - 1);
			const ne = tileActive(grid, tx, ty - 1);
			const sw = tileActive(grid, tx - 1, ty);
			const se = tileActive(grid, tx, ty);
			const count = [nw, ne, sw, se].filter(Boolean).length;

			if (count === 4) {
				nodeKind[gy][gx] = "full";
			} else if (count === 1) {
				nodeKind[gy][gx] = "outer";
				if (se) nodeDir[gy][gx] = "tl";
				else if (sw) nodeDir[gy][gx] = "tr";
				else if (ne) nodeDir[gy][gx] = "bl";
				else if (nw) nodeDir[gy][gx] = "br";
			} else if (count === 3) {
				nodeKind[gy][gx] = "inner";
			} else if (count === 2) {
				if (nw && ne) {
					nodeKind[gy][gx] = "edge";
					nodeDir[gy][gx] = "up";
				} else if (sw && se) {
					nodeKind[gy][gx] = "edge";
					nodeDir[gy][gx] = "down";
				} else if (nw && sw) {
					nodeKind[gy][gx] = "edge";
					nodeDir[gy][gx] = "left";
				} else if (ne && se) {
					nodeKind[gy][gx] = "edge";
					nodeDir[gy][gx] = "right";
				} else {
					nodeKind[gy][gx] = "diag";
				}
			} else if (count > 0) {
				nodeKind[gy][gx] = "used";
			}
		}
	}

	return { nodeKind, nodeDir };
}

function enableOuterCornerChamfers(grid, width, height) {
	const next = cloneGrid(grid);
	const topo = deriveTopology(next, width, height);
	const { gw, gh } = gridSize(width, height);
	for (let gy = 0; gy < gh; gy++) {
		for (let gx = 0; gx < gw; gx++) {
			if (isNodePos(gx, gy) && topo.nodeKind[gy][gx] === "outer") {
				next[gy][gx] |= BITS.CHAMFER;
			}
		}
	}
	return next;
}

function applyPreset(grid, width, height, mode) {
	const next = cloneGrid(grid);
	const topo = deriveTopology(next, width, height);
	const { gw, gh } = gridSize(width, height);

	for (let gy = 0; gy < gh; gy++) {
		for (let gx = 0; gx < gw; gx++) {
			if (!isNodePos(gx, gy)) continue;
			const kind = topo.nodeKind[gy][gx];
			if (kind === "none" || kind === "used") continue;

			if (
				mode === "holes_all" &&
				(kind === "full" || kind === "inner" || kind === "diag")
			) {
				next[gy][gx] ^= BITS.HOLE;
			}
			if (mode === "connectors_edge" && kind === "edge") {
				next[gy][gx] ^= BITS.HOLE;
			}
			if (mode === "chamfer_all") {
				next[gy][gx] ^= BITS.CHAMFER;
			}
			if (mode === "clear_all") {
				if (!isTilePos(gx, gy)) next[gy][gx] = 0;
			}
		}
	}

	if (mode === "clear_all") return next;

	for (let gy = 0; gy < gh; gy++) {
		for (let gx = 0; gx < gw; gx++) {
			if (isNodePos(gx, gy) && topo.nodeKind[gy][gx] === "outer") {
				next[gy][gx] |= BITS.CHAMFER;
			}
		}
	}
	return next;
}

function sanitizeMask(grid, width, height) {
	const topo = deriveTopology(grid, width, height);
	const out = Array.from({ length: height + 1 }, () =>
		Array.from({ length: width + 1 }, () => 0),
	);

	for (let ty = 0; ty < height; ty++) {
		for (let tx = 0; tx < width; tx++) {
			const { gx, gy } = tileCoordToGrid(tx, ty);
			if (hasBit(getMask(grid, gx, gy), BITS.TILE)) out[ty][tx] |= BITS.TILE;
		}
	}

	for (let y = 0; y <= height; y++) {
		for (let x = 0; x <= width; x++) {
			const gx = x * 2;
			const gy = y * 2;
			const raw = getMask(grid, gx, gy);
			const kind = topo.nodeKind[gy][gx];
			const hasHole = hasBit(raw, BITS.HOLE);

			if (
				(kind === "full" ||
					kind === "inner" ||
					kind === "diag" ||
					kind === "edge") &&
				hasHole
			)
				out[y][x] |= BITS.HOLE;
			if (
				(kind === "full" ||
					kind === "inner" ||
					kind === "outer" ||
					kind === "edge" ||
					kind === "diag") &&
				hasBit(raw, BITS.CHAMFER)
			)
				out[y][x] |= BITS.CHAMFER;
		}
	}

	return out;
}

function toScad2DArray(grid) {
	const rows = grid.map((row) => `  [${row.join(", ")}]`);
	return `[\n${rows.join(",\n")}\n]`;
}

function toScadBool(v) {
	return v ? "true" : "false";
}

function buildEntryScad(config) {
	const {
		exportGrid,
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
		backsideScrewHeadCountersunkDegreeValue,
		stackCountValue,
		stackingMethod,
		interfaceThicknessValue,
		interfaceSeparationValue,
		circleSegmentsValue,
	} = config;

	return `/*
	Usage: Download 'opengrid_generator.scad' from https://github.com/ClassicOldSong/openGrid-Studio
	and place in the same dir of this script.
*/

include <BOSL2/std.scad>
use <opengrid_generator.scad>

mask = ${toScad2DArray(exportGrid)};

openGridFromMask(
	mask_array = mask,
	full_or_lite = \"${fullOrLite}\",
	tile_size = ${tileSizeValue},
	tile_thickness = ${tileThicknessValue},
	lite_tile_thickness = ${liteTileThicknessValue},
	heavy_tile_thickness = ${heavyTileThicknessValue},
	heavy_tile_gap = ${heavyTileGapValue},
	add_adhesive_base = ${toScadBool(addAdhesiveBase)},
	adhesive_base_thickness = ${adhesiveBaseThicknessValue},
	screw_diameter = ${screwDiameterValue},
	screw_head_diameter = ${screwHeadDiameterValue},
	screw_head_inset = ${screwHeadInsetValue},
	screw_head_is_countersunk = ${toScadBool(screwHeadIsCountersunk)},
	screw_head_countersunk_degree = ${screwHeadCountersunkDegreeValue},
	backside_screw_hole = ${toScadBool(backsideScrewHole)},
	backside_screw_head_diameter_shrink = ${backsideScrewHeadDiameterShrinkValue},
	backside_screw_head_inset = ${backsideScrewHeadInsetValue},
	backside_screw_head_is_countersunk = ${toScadBool(backsideScrewHeadIsCountersunk)},
	backside_screw_head_countersunk_degree = ${backsideScrewHeadCountersunkDegreeValue},
	stack_count = ${stackCountValue},
	stacking_method = \"${stackingMethod}\",
	interface_thickness = ${interfaceThicknessValue},
	interface_separation = ${interfaceSeparationValue},
	circle_segments = ${circleSegmentsValue},
	anchor = BOT,
	spin = 0,
	orient = UP
);`;
}

function nodeState(kind, raw) {
	const hasHole = hasBit(raw, BITS.HOLE);
	if (kind === "edge") {
		if (hasHole) return "hole";
		if (hasBit(raw, BITS.CHAMFER)) return "chamfer";
		return "none";
	}
	if (kind === "inner" || kind === "full" || kind === "diag") {
		if (hasHole) return "hole";
		if (hasBit(raw, BITS.CHAMFER)) return "chamfer";
		return "none";
	}
	if (kind === "outer") {
		if (hasBit(raw, BITS.CHAMFER)) return "chamfer";
		return "none";
	}
	return "none";
}

function diamondPoints(x, y, r) {
	return `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`;
}

function diamondPath(x, y, r) {
	return `M ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} L ${x - r} ${y} Z`;
}

function squareTile(x, y, size) {
	return { x: x - size / 2, y: y - size / 2, w: size, h: size };
}

function rectPath(x, y, w, h) {
	return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
}

function resizeMask(
	oldGrid,
	oldW,
	oldH,
	nextW,
	nextH,
	offsetX = 0,
	offsetY = 0,
) {
	const nextGrid = makeMaskGrid(nextW, nextH, 0);

	// Fill all tiles by default in the new grid
	for (let ty = 0; ty < nextH; ty++) {
		for (let tx = 0; tx < nextW; tx++) {
			const { gx, gy } = tileCoordToGrid(tx, ty);
			nextGrid[gy][gx] = BITS.TILE;
		}
	}

	const { gw: oldGW, gh: oldGH } = gridSize(oldW, oldH);
	const { gw: nextGW, gh: nextGH } = gridSize(nextW, nextH);

	for (let y = 0; y < oldGH; y++) {
		for (let x = 0; x < oldGW; x++) {
			const ny = y + offsetY * 2;
			const nx = x + offsetX * 2;
			if (ny >= 0 && ny < nextGH && nx >= 0 && nx < nextGW) {
				// Overlay old data (this preserves both active and inactive states from the original design)
				nextGrid[ny][nx] = oldGrid[y][x];
			}
		}
	}

	// Re-run chamfer logic to ensure new outer corners are enabled
	return enableOuterCornerChamfers(nextGrid, nextW, nextH);
}

export default function App() {
	const themeMode = signal(DEFAULT_CONFIG.themeMode);
	const previewMode = signal("2d");
	const exportFormat = signal(DEFAULT_CONFIG.exportFormat);
	const systemPrefersDark = signal(false);
	const exportInFlight = signal(false);
	const exportError = signal("");
	const previewMesh = signal(null);
	const previewLoading = signal(false);
	const previewError = signal("");
	const fullOrLite = signal(DEFAULT_CONFIG.fullOrLite);
	const tileSizeValue = signal(DEFAULT_CONFIG.tileSizeValue);
	const tileThicknessValue = signal(DEFAULT_CONFIG.tileThicknessValue);
	const liteTileThicknessValue = signal(DEFAULT_CONFIG.liteTileThicknessValue);
	const heavyTileThicknessValue = signal(
		DEFAULT_CONFIG.heavyTileThicknessValue,
	);
	const heavyTileGapValue = signal(DEFAULT_CONFIG.heavyTileGapValue);
	const addAdhesiveBase = signal(DEFAULT_CONFIG.addAdhesiveBase);
	const adhesiveBaseThicknessValue = signal(
		DEFAULT_CONFIG.adhesiveBaseThicknessValue,
	);
	const screwDiameterValue = signal(DEFAULT_CONFIG.screwDiameterValue);
	const screwHeadDiameterValue = signal(DEFAULT_CONFIG.screwHeadDiameterValue);
	const screwHeadInsetValue = signal(DEFAULT_CONFIG.screwHeadInsetValue);
	const screwHeadIsCountersunk = signal(DEFAULT_CONFIG.screwHeadIsCountersunk);
	const screwHeadCountersunkDegreeValue = signal(
		DEFAULT_CONFIG.screwHeadCountersunkDegreeValue,
	);
	const backsideScrewHole = signal(DEFAULT_CONFIG.backsideScrewHole);
	const backsideScrewHeadDiameterShrinkValue = signal(
		DEFAULT_CONFIG.backsideScrewHeadDiameterShrinkValue,
	);
	const backsideScrewHeadInsetValue = signal(
		DEFAULT_CONFIG.backsideScrewHeadInsetValue,
	);
	const backsideScrewHeadIsCountersunk = signal(
		DEFAULT_CONFIG.backsideScrewHeadIsCountersunk,
	);
	const backsideScrewHeadCountersunkDegreeValue = signal(
		DEFAULT_CONFIG.backsideScrewHeadCountersunkDegreeValue,
	);
	const stackCountValue = signal(DEFAULT_CONFIG.stackCountValue);
	const stackingMethod = signal(DEFAULT_CONFIG.stackingMethod);
	const interfaceThicknessValue = signal(
		DEFAULT_CONFIG.interfaceThicknessValue,
	);
	const interfaceSeparationValue = signal(
		DEFAULT_CONFIG.interfaceSeparationValue,
	);
	const circleSegmentsValue = signal(DEFAULT_CONFIG.circleSegmentsValue);
	const width = signal(DEFAULT_CONFIG.width);
	const height = signal(DEFAULT_CONFIG.height);
	const top1Text = signal(DEFAULT_CONFIG.top1Text);
	const top2Text = signal(DEFAULT_CONFIG.top2Text);
	const maskGrid = signal(cloneGrid(DEFAULT_CONFIG.maskGrid));

	const showModal = signal(false);
	const showAboutModal = signal(false);
	const layoutMedia = window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY);
	const userAgent = navigator.userAgent;
	const isIOSWebKit =
		/iPad|iPhone|iPod/i.test(userAgent) ||
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
	const isSafariDesktop =
		/Safari/i.test(userAgent) &&
		!/Chrome|Chromium|CriOS|Edg|OPR|OPiOS|FxiOS|Firefox|Android/i.test(
			userAgent,
		);
	const isWebKitEngine = signal(isIOSWebKit || isSafariDesktop);
	const isMobileLayout = signal(layoutMedia.matches);
	const isDesktopLayout = $(() => !isMobileLayout.value);
	const mobileConfigPanelOpen = signal(false);
	let persistConfig = true;
	const exportWorker = new Worker(
		new URL("./export-worker.js", import.meta.url),
		{ type: "module" },
	);
	let workerRequestId = 0;
	const pendingWorkerRequests = new Map();

	exportWorker.postMessage({ type: "warmup" });

	exportWorker.onmessage = ({ data }) => {
		const pending = pendingWorkerRequests.get(data.id);
		if (!pending) return;
		pendingWorkerRequests.delete(data.id);
		if (data.ok) pending.resolve(data);
		else pending.reject(new Error(data.error));
	};

	exportWorker.onerror = (event) => {
		const error = event.message || "Export worker failed.";
		for (const pending of pendingWorkerRequests.values())
			pending.reject(new Error(error));
		pendingWorkerRequests.clear();
	};

	const applyConfig = (config) => {
		themeMode.value = config.themeMode ?? DEFAULT_CONFIG.themeMode;
		exportFormat.value = config.exportFormat ?? DEFAULT_CONFIG.exportFormat;
		fullOrLite.value = config.fullOrLite ?? DEFAULT_CONFIG.fullOrLite;
		tileSizeValue.value = config.tileSizeValue ?? DEFAULT_CONFIG.tileSizeValue;
		tileThicknessValue.value =
			config.tileThicknessValue ?? DEFAULT_CONFIG.tileThicknessValue;
		liteTileThicknessValue.value =
			config.liteTileThicknessValue ?? DEFAULT_CONFIG.liteTileThicknessValue;
		heavyTileThicknessValue.value =
			config.heavyTileThicknessValue ?? DEFAULT_CONFIG.heavyTileThicknessValue;
		heavyTileGapValue.value =
			config.heavyTileGapValue ?? DEFAULT_CONFIG.heavyTileGapValue;
		addAdhesiveBase.value =
			config.addAdhesiveBase ?? DEFAULT_CONFIG.addAdhesiveBase;
		adhesiveBaseThicknessValue.value =
			config.adhesiveBaseThicknessValue ??
			DEFAULT_CONFIG.adhesiveBaseThicknessValue;
		screwDiameterValue.value =
			config.screwDiameterValue ?? DEFAULT_CONFIG.screwDiameterValue;
		screwHeadDiameterValue.value =
			config.screwHeadDiameterValue ?? DEFAULT_CONFIG.screwHeadDiameterValue;
		screwHeadInsetValue.value =
			config.screwHeadInsetValue ?? DEFAULT_CONFIG.screwHeadInsetValue;
		screwHeadIsCountersunk.value =
			config.screwHeadIsCountersunk ?? DEFAULT_CONFIG.screwHeadIsCountersunk;
		screwHeadCountersunkDegreeValue.value =
			config.screwHeadCountersunkDegreeValue ??
			DEFAULT_CONFIG.screwHeadCountersunkDegreeValue;
		backsideScrewHole.value =
			config.backsideScrewHole ?? DEFAULT_CONFIG.backsideScrewHole;
		backsideScrewHeadDiameterShrinkValue.value =
			config.backsideScrewHeadDiameterShrinkValue ??
			DEFAULT_CONFIG.backsideScrewHeadDiameterShrinkValue;
		backsideScrewHeadInsetValue.value =
			config.backsideScrewHeadInsetValue ??
			DEFAULT_CONFIG.backsideScrewHeadInsetValue;
		backsideScrewHeadIsCountersunk.value =
			config.backsideScrewHeadIsCountersunk ??
			DEFAULT_CONFIG.backsideScrewHeadIsCountersunk;
		backsideScrewHeadCountersunkDegreeValue.value =
			config.backsideScrewHeadCountersunkDegreeValue ??
			DEFAULT_CONFIG.backsideScrewHeadCountersunkDegreeValue;
		stackCountValue.value =
			config.stackCountValue ?? DEFAULT_CONFIG.stackCountValue;
		stackingMethod.value =
			config.stackingMethod ?? DEFAULT_CONFIG.stackingMethod;
		interfaceThicknessValue.value =
			config.interfaceThicknessValue ?? DEFAULT_CONFIG.interfaceThicknessValue;
		interfaceSeparationValue.value =
			config.interfaceSeparationValue ??
			DEFAULT_CONFIG.interfaceSeparationValue;
		circleSegmentsValue.value =
			config.circleSegmentsValue ?? DEFAULT_CONFIG.circleSegmentsValue;
		width.value = config.width ?? DEFAULT_CONFIG.width;
		height.value = config.height ?? DEFAULT_CONFIG.height;
		top1Text.value = config.top1Text ?? DEFAULT_CONFIG.top1Text;
		top2Text.value = config.top2Text ?? DEFAULT_CONFIG.top2Text;
		maskGrid.value = cloneGrid(config.maskGrid ?? DEFAULT_CONFIG.maskGrid);
	};

	const getConfigState = () => ({
		themeMode: themeMode.value,
		exportFormat: exportFormat.value,
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
			backsideScrewHeadCountersunkDegreeValue.value,
		stackCountValue: stackCountValue.value,
		stackingMethod: stackingMethod.value,
		interfaceThicknessValue: interfaceThicknessValue.value,
		interfaceSeparationValue: interfaceSeparationValue.value,
		circleSegmentsValue: circleSegmentsValue.value,
		width: width.value,
		height: height.value,
		top1Text: top1Text.value,
		top2Text: top2Text.value,
		maskGrid: maskGrid.value,
	});

	const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
	systemPrefersDark.value = themeMedia.matches;
	const onThemeChange = (event) => {
		systemPrefersDark.value = event.matches;
	};
	if (themeMedia.addEventListener)
		themeMedia.addEventListener("change", onThemeChange);
	else themeMedia.addListener(onThemeChange);
	onDispose(() => {
		if (themeMedia.removeEventListener)
			themeMedia.removeEventListener("change", onThemeChange);
		else themeMedia.removeListener(onThemeChange);
	});

	onDispose(() => {
		for (const pending of pendingWorkerRequests.values())
			pending.reject(new Error("Worker task was interrupted."));
		pendingWorkerRequests.clear();
		exportWorker.terminate();
	});

	// Load from local storage
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const saved = JSON.parse(raw);
			if (saved) {
				nextTick(() => {
					applyConfig({
						...DEFAULT_CONFIG,
						...saved,
						themeMode:
							saved.themeMode ??
							(saved.theme === "light" || saved.theme === "dark"
								? saved.theme
								: DEFAULT_CONFIG.themeMode),
					});
				})
			}
		}
	} catch (e) {}

	// Save to local storage
	watch(() => {
		if (!persistConfig) return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(getConfigState()));
	});

	const resolvedTheme = $(() => {
		if (themeMode.value === "auto")
			return systemPrefersDark.value ? "dark" : "light";
		return themeMode.value;
	});

	watch(() => {
		const isDark = resolvedTheme.value === "dark";
		document.documentElement.classList.toggle("dark", isDark);
		document.documentElement.style.colorScheme = resolvedTheme.value;
	});

	const topo = $(() =>
		deriveTopology(maskGrid.value, width.value, height.value),
	);
	const exportGrid = $(() =>
		sanitizeMask(maskGrid.value, width.value, height.value),
	);
	const exportConfig = $(() => ({
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
			backsideScrewHeadCountersunkDegreeValue.value,
		stackCountValue: stackCountValue.value,
		stackingMethod: stackingMethod.value,
		interfaceThicknessValue: interfaceThicknessValue.value,
		interfaceSeparationValue: interfaceSeparationValue.value,
		circleSegmentsValue: circleSegmentsValue.value,
	}));
	const previewConfigJson = $(() => JSON.stringify(exportConfig.value));
	const exportText = $(() => buildEntryScad(exportConfig.value));

	const updateSize = (nextW, nextH, offsetX = 0, offsetY = 0) => {
		const nw = Math.max(BOARD_DIMENSION_MIN, nextW);
		const nh = Math.max(BOARD_DIMENSION_MIN, nextH);
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
				clampIntegerInput(top1Text.value, TOP_COLUMN_MIN, nw, TOP_COLUMN_MIN),
			);
			top2Text.value = String(
				clampIntegerInput(top2Text.value, TOP_COLUMN_MIN, nw, TOP_COLUMN_MIN),
			);
		}
	};

	// const applyRectangle = () => {
	//   maskGrid.value = buildRectangleMask(width.value, height.value);
	//   top1Text.value = '0';
	//   top2Text.value = '0';
	// };

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

	const perform2DEditorAction = (action) => {
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

	const read2DEditorAction = (target) => {
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

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(exportText.value);
			showModal.value = true;
		} catch {}
	};

	const requestWorker = (type, payload = {}) =>
		new Promise((resolve, reject) => {
			const id = ++workerRequestId;
			pendingWorkerRequests.set(id, { resolve, reject });
			exportWorker.postMessage({ id, type, ...payload });
		});

	const renderExport = (config, format) =>
		requestWorker("render-export", { config, format });
	const renderPreviewMesh = (config) =>
		requestWorker("preview-mesh", { config });

	const downloadExport = async () => {
		if (exportInFlight.value) return;
		exportInFlight.value = true;
		exportError.value = "";
		let objectUrl = null;

		try {
			const config = exportConfig.value;
			const format = exportFormat.value;
			const filename = buildExportFilename(config, format);
			const { bytes, mimeType, logs } = await renderExport(config, format);
			const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
			objectUrl = URL.createObjectURL(blob);
			const element = document.createElement("a");
			element.href = objectUrl;
			element.download = filename;
			document.body.appendChild(element);
			element.click();
			document.body.removeChild(element);
			if (logs?.length) console.info("Export:", logs.join("\n"));
		} catch (error) {
			exportError.value =
				error instanceof Error ? error.message : "Export failed.";
		} finally {
			if (objectUrl) URL.revokeObjectURL(objectUrl);
			exportInFlight.value = false;
		}
	};

	const chooseExportFormat = (format, event) => {
		exportFormat.value = format;
		event?.currentTarget?.closest("details")?.removeAttribute("open");
	};

	const openCopyScadFromMenu = (event) => {
		event?.currentTarget?.closest("details")?.removeAttribute("open");
		copy();
	};

	const closeExportMenus = () => {
		for (const element of document.querySelectorAll(".js-export-menu[open]")) {
			element.removeAttribute("open");
		}
	};

	const openConfigPanel = () => {
		mobileConfigPanelOpen.value = true;
	};

	const closeConfigPanel = () => {
		mobileConfigPanelOpen.value = false;
	};

	const clearConfiguration = () => {
		persistConfig = false;
		localStorage.removeItem(STORAGE_KEY);
		applyConfig(DEFAULT_CONFIG);
		queueMicrotask(() => {
			persistConfig = true;
		});
	};

	const tileSize = 56;
	const step = tileSize / 2;
	const pad = 32;
	const half = tileSize / 2;
	const editor2DBoardMaterialClipId = "editor-2d-board-material-clip";
	const editor2DNodeMaskId = "editor-2d-node-mask";
	const editor2DZoom = signal(1);
	const editor2DPanX = signal(0);
	const editor2DPanY = signal(0);
	const editor2DViewportWidth = signal(1);
	const editor2DViewportHeight = signal(1);
	const editor2DShowHint = signal(true);

	let editor2DViewportEl = null;
	let editor2DResizeObserver = null;
	let editor2DPointerId = null;
	let editor2DDragStartX = 0;
	let editor2DDragStartY = 0;
	let editor2DDragStartPanX = 0;
	let editor2DDragStartPanY = 0;
	let editor2DGestureStartZoom = 1;
	let editor2DGestureStartPanX = 0;
	let editor2DGestureStartPanY = 0;
	let editor2DGestureStartDistance = 1;
	let editor2DGestureStartCenterX = 0;
	let editor2DGestureStartCenterY = 0;
	const editor2DActiveTouches = new Map();
	let editor2DPressedAction = null;
	let editor2DIsDragging = false;
	let editor2DGestureActive = false;
	let editor2DHasManualNavigation = false;
	const WEBKIT_EDITOR_2D_MAX_RASTER_SCALE = 2;

	const svgW = $(() => width.value * tileSize + pad * 2);
	const svgH = $(() => height.value * tileSize + pad * 2);
	const boardW = $(() => width.value * tileSize);
	const boardH = $(() => height.value * tileSize);
	const get2DEditorDefaultScale = () => {
		const contentWidth = Math.max(svgW.value, 1);
		const contentHeight = Math.max(svgH.value, 1);
		const viewportWidth = Math.max(editor2DViewportWidth.value, 1);
		const viewportHeight = Math.max(editor2DViewportHeight.value, 1);
		const fitScale = Math.min(
			viewportWidth / contentWidth,
			viewportHeight / contentHeight,
		);
		const cappedScale = EDITOR_2D_INITIAL_MAX_TILE_PX / tileSize;
		return Math.min(fitScale, cappedScale);
	};
	const get2DEditorSceneFrame = (
		zoom = editor2DZoom.value,
		panX = editor2DPanX.value,
		panY = editor2DPanY.value,
	) => {
		const contentWidth = svgW.value;
		const contentHeight = svgH.value;
		const viewportWidth = Math.max(editor2DViewportWidth.value, 1);
		const viewportHeight = Math.max(editor2DViewportHeight.value, 1);
		const nextZoom = clamp(zoom, EDITOR_2D_MIN_ZOOM, EDITOR_2D_MAX_ZOOM);
		const scale = get2DEditorDefaultScale() * nextZoom;
		const renderedWidth = contentWidth * scale;
		const renderedHeight = contentHeight * scale;
		const baseX = (viewportWidth - renderedWidth) / 2;
		const baseY = (viewportHeight - renderedHeight) / 2;
		const maxPanX =
			renderedWidth > viewportWidth ? (renderedWidth - viewportWidth) / 2 : 0;
		const maxPanY =
			renderedHeight > viewportHeight ? (renderedHeight - viewportHeight) / 2 : 0;
		const clampedPanX = clamp(panX, -maxPanX, maxPanX);
		const clampedPanY = clamp(panY, -maxPanY, maxPanY);
		return {
			contentWidth,
			contentHeight,
			viewportWidth,
			viewportHeight,
			scale,
			renderedWidth,
			renderedHeight,
			baseX,
			baseY,
			maxPanX,
			maxPanY,
			panX: clampedPanX,
			panY: clampedPanY,
			left: baseX + clampedPanX,
			top: baseY + clampedPanY,
		};
	};
	const set2DEditorView = (
		zoom = editor2DZoom.value,
		panX = editor2DPanX.value,
		panY = editor2DPanY.value,
	) => {
		const nextZoom = clamp(zoom, EDITOR_2D_MIN_ZOOM, EDITOR_2D_MAX_ZOOM);
		const frame = get2DEditorSceneFrame(nextZoom, panX, panY);
		editor2DZoom.value = nextZoom;
		editor2DPanX.value = frame.panX;
		editor2DPanY.value = frame.panY;
	};
	const fit2DEditorInitialView = () => {
		if (editor2DViewportWidth.value <= 1 || editor2DViewportHeight.value <= 1)
			return;
		set2DEditorView(1, 0, 0);
	};
	const set2DEditorViewFromAnchor = ({
		nextZoom,
		anchorClientX,
		anchorClientY,
		targetClientX = anchorClientX,
		targetClientY = anchorClientY,
		baseZoom = editor2DZoom.value,
		basePanX = editor2DPanX.value,
		basePanY = editor2DPanY.value,
	}) => {
		if (!editor2DViewportEl) {
			set2DEditorView(nextZoom, basePanX, basePanY);
			return;
		}
		const rect = editor2DViewportEl.getBoundingClientRect();
		const anchorX = anchorClientX - rect.left;
		const anchorY = anchorClientY - rect.top;
		const targetX = targetClientX - rect.left;
		const targetY = targetClientY - rect.top;
		const sourceFrame = get2DEditorSceneFrame(baseZoom, basePanX, basePanY);
		const worldX = (anchorX - sourceFrame.left) / Math.max(sourceFrame.scale, 0.0001);
		const worldY = (anchorY - sourceFrame.top) / Math.max(sourceFrame.scale, 0.0001);
		const nextFrame = get2DEditorSceneFrame(nextZoom, 0, 0);
		set2DEditorView(
			nextZoom,
			targetX - nextFrame.baseX - worldX * nextFrame.scale,
			targetY - nextFrame.baseY - worldY * nextFrame.scale,
		);
	};
	const update2DEditorViewportSize = () => {
		if (!editor2DViewportEl) return;
		const rect = editor2DViewportEl.getBoundingClientRect();
		editor2DViewportWidth.value = Math.max(1, Math.floor(rect.width));
		editor2DViewportHeight.value = Math.max(1, Math.floor(rect.height));
	};
	const attach2DEditorViewport = (el) => {
		editor2DViewportEl = el;
		editor2DResizeObserver?.disconnect();
		editor2DResizeObserver = null;

		if (el && typeof ResizeObserver !== "undefined") {
			editor2DResizeObserver = new ResizeObserver(update2DEditorViewportSize);
			editor2DResizeObserver.observe(el);
			queueMicrotask(update2DEditorViewportSize);
		}
	};
	const begin2DEditorTouchGesture = () => {
		const points = [...editor2DActiveTouches.values()];
		if (points.length < 2) return;
		const [a, b] = points;
		editor2DGestureStartZoom = editor2DZoom.value;
		editor2DGestureStartPanX = editor2DPanX.value;
		editor2DGestureStartPanY = editor2DPanY.value;
		editor2DGestureStartDistance = Math.max(
			1,
			Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
		);
		editor2DGestureStartCenterX = (a.clientX + b.clientX) / 2;
		editor2DGestureStartCenterY = (a.clientY + b.clientY) / 2;
	};
	const update2DEditorTouchGesture = () => {
		const points = [...editor2DActiveTouches.values()];
		if (points.length < 2) return;
		const [a, b] = points;
		const centerX = (a.clientX + b.clientX) / 2;
		const centerY = (a.clientY + b.clientY) / 2;
		const nextZoom =
			editor2DGestureStartZoom *
			(Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)) /
				editor2DGestureStartDistance);
		set2DEditorViewFromAnchor({
			nextZoom,
			anchorClientX: editor2DGestureStartCenterX,
			anchorClientY: editor2DGestureStartCenterY,
			targetClientX: centerX,
			targetClientY: centerY,
			baseZoom: editor2DGestureStartZoom,
			basePanX: editor2DGestureStartPanX,
			basePanY: editor2DGestureStartPanY,
		});
	};
	const editor2DViewportViewBox = $(
		() =>
			`0 0 ${Math.max(editor2DViewportWidth.value, 1)} ${Math.max(
				editor2DViewportHeight.value,
				1,
			)}`,
	);
	const editor2DSceneViewBox = $(() => `0 0 ${svgW.value} ${svgH.value}`);
	const editor2DSceneFrame = $(() =>
		get2DEditorSceneFrame(
			editor2DZoom.value,
			editor2DPanX.value,
			editor2DPanY.value,
		),
	);
	const editor2DUseCssTransformPath = isWebKitEngine;
	const editor2DSvgRasterScale = $(() => {
		if (!editor2DUseCssTransformPath.value) return 1;
		return clamp(
			Math.ceil(editor2DSceneFrame.value.scale),
			1,
			WEBKIT_EDITOR_2D_MAX_RASTER_SCALE,
		);
	});
	const editor2DSceneTransform = $(() => {
		if (editor2DUseCssTransformPath.value) return undefined;
		const frame = editor2DSceneFrame.value;
		return `translate(${frame.left} ${frame.top}) scale(${frame.scale})`;
	});
	const editor2DSvgClass = $(() =>
		editor2DUseCssTransformPath.value
			? "absolute left-0 top-0 block max-w-none overflow-visible"
			: "block h-full w-full",
	);
	const editor2DSvgStyle = $(() => {
		if (!editor2DUseCssTransformPath.value) return "background: transparent;";
		const frame = editor2DSceneFrame.value;
		return `background: transparent; transform: translate3d(${frame.left}px, ${frame.top}px, 0) scale(${frame.scale / editor2DSvgRasterScale.value}); transform-origin: 0 0; will-change: transform;`;
	});
	const editor2DSvgViewBox = $(() =>
		editor2DUseCssTransformPath.value
			? editor2DSceneViewBox.value
			: editor2DViewportViewBox.value,
	);
	const editor2DSvgPreserveAspectRatio = $(() =>
		editor2DUseCssTransformPath.value ? undefined : "none",
	);
	const editor2DSvgWidth = $(() =>
		editor2DUseCssTransformPath.value
			? Math.max(1, Math.ceil(svgW.value * editor2DSvgRasterScale.value))
			: undefined,
	);
	const editor2DSvgHeight = $(() =>
		editor2DUseCssTransformPath.value
			? Math.max(1, Math.ceil(svgH.value * editor2DSvgRasterScale.value))
			: undefined,
	);
	const editor2DBackgroundStyle = $(() =>
		resolvedTheme.value === "dark"
			? "background: linear-gradient(180deg, #0f172a 0%, #020617 100%);"
			: "background: linear-gradient(180deg, #f8fafc 0%, #dbeafe 100%);",
	);
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
	const editor2DTopAddX = $(() => editor2DCenterX.value - EDITOR_2D_RESIZE_BUTTON_OFFSET);
	const editor2DTopRemoveX = $(() => editor2DCenterX.value + EDITOR_2D_RESIZE_BUTTON_OFFSET);
	const editor2DBottomAddX = $(() => editor2DCenterX.value - EDITOR_2D_RESIZE_BUTTON_OFFSET);
	const editor2DBottomRemoveX = $(() => editor2DCenterX.value + EDITOR_2D_RESIZE_BUTTON_OFFSET);
	const editor2DLeftAddY = $(() => editor2DCenterY.value - EDITOR_2D_RESIZE_BUTTON_OFFSET);
	const editor2DLeftRemoveY = $(() => editor2DCenterY.value + EDITOR_2D_RESIZE_BUTTON_OFFSET);
	const editor2DRightAddY = $(() => editor2DCenterY.value - EDITOR_2D_RESIZE_BUTTON_OFFSET);
	const editor2DRightRemoveY = $(() => editor2DCenterY.value + EDITOR_2D_RESIZE_BUTTON_OFFSET);
	const editor2DHintClass = $(() =>
		isMobileLayout.value
			? "pointer-events-none absolute left-1/2 top-4 z-10 w-[min(calc(100%-2rem),320px)] -translate-x-1/2 rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-center text-[11px] font-medium text-slate-500 backdrop-blur dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-400"
			: "pointer-events-none absolute right-4 bottom-4 z-10 rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-[11px] font-medium text-slate-500 backdrop-blur dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-400",
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
				if (isNodePos(gx, gy)) {
					const kind = row[gx];
					if (kind !== "none" && kind !== "used") {
						items.push({ id: `${gx}-${gy}`, gx, gy });
					}
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

	const themeOptionClass = (mode) => createThemeOptionClass(themeMode, mode);
	const previewOptionClass = (mode) =>
		createPreviewOptionClass(previewMode, mode);
	const exportFormatLabel = $(
		() => getExportFormatMeta(exportFormat.value).label,
	);
	const exportButtonClass = createExportButtonClass(exportInFlight);
	const exportDropdownButtonClass =
		createExportDropdownButtonClass(exportInFlight);
	const editor2DViewportClass = createEditor2DViewportClass(isMobileLayout);
	const editor2DViewportStyle = createEditor2DViewportStyle(isMobileLayout);
	const exportMenuItemClass = (format) =>
		createExportMenuItemClass(exportFormat, format);

	let previewTimer = null;
	let previewSequence = 0;

	const cancelPreviewRender = (clearMesh = false) => {
		if (previewTimer) {
			clearTimeout(previewTimer);
			previewTimer = null;
		}
		previewSequence += 1;
		previewLoading.value = false;
		previewError.value = "";
		if (clearMesh) previewMesh.value = null;
	};

	const queuePreviewRender = (config) => {
		if (previewTimer) clearTimeout(previewTimer);
		previewTimer = setTimeout(async () => {
			const sequence = ++previewSequence;
			previewLoading.value = true;
			previewError.value = "";

			try {
				const { mesh } = await renderPreviewMesh(config);
				if (sequence !== previewSequence) return;
				previewMesh.value = mesh;
				previewLoading.value = false;
			} catch (error) {
				if (sequence !== previewSequence) return;
				previewError.value =
					error instanceof Error ? error.message : "Preview generation failed.";
				previewLoading.value = false;
			}
		}, 120);
	};

	watch(() => {
		const previewConfig = JSON.parse(previewConfigJson.value);
		if (previewMode.value !== "3d") {
			cancelPreviewRender(false);
			return;
		}
		queuePreviewRender(previewConfig);
	});

	onDispose(() => {
		cancelPreviewRender(false);
	});

	const syncLayoutMode = (matches) => {
		const nextIsMobile = matches;
		const previousIsMobile = isMobileLayout.value;
		isMobileLayout.value = nextIsMobile;
		if (nextIsMobile !== previousIsMobile) {
			mobileConfigPanelOpen.value = false;
		}
	};
	const onLayoutChange = (event) => {
		syncLayoutMode(event.matches);
	};

	syncLayoutMode(layoutMedia.matches);
	if (layoutMedia.addEventListener)
		layoutMedia.addEventListener("change", onLayoutChange);
	else layoutMedia.addListener(onLayoutChange);
	onDispose(() => {
		if (layoutMedia.removeEventListener)
			layoutMedia.removeEventListener("change", onLayoutChange);
		else layoutMedia.removeListener(onLayoutChange);
	});

	const onPointerDown = (event) => {
		if (event.target?.closest?.(".js-export-menu")) return;
		closeExportMenus();
	};
	document.addEventListener("pointerdown", onPointerDown);
	onDispose(() => document.removeEventListener("pointerdown", onPointerDown));
	onDispose(() => editor2DResizeObserver?.disconnect());

	watch(() => {
		const frame = get2DEditorSceneFrame(
			editor2DZoom.value,
			editor2DPanX.value,
			editor2DPanY.value,
		);
		if (frame.panX !== editor2DPanX.value) editor2DPanX.value = frame.panX;
		if (frame.panY !== editor2DPanY.value) editor2DPanY.value = frame.panY;
	});
	watch(() => {
		editor2DViewportWidth.value;
		editor2DViewportHeight.value;
		svgW.value;
		svgH.value;
		if (!editor2DHasManualNavigation) fit2DEditorInitialView();
	});

	const start2DEditorPointerSession = (pointerId, clientX, clientY, action) => {
		editor2DPointerId = pointerId;
		editor2DDragStartX = clientX;
		editor2DDragStartY = clientY;
		editor2DDragStartPanX = editor2DPanX.value;
		editor2DDragStartPanY = editor2DPanY.value;
		editor2DPressedAction = action;
		editor2DIsDragging = false;
		if (editor2DViewportEl) editor2DViewportEl.style.cursor = "grabbing";
	};

	const finish2DEditorPointerSession = () => {
		editor2DPointerId = null;
		editor2DPressedAction = null;
		editor2DIsDragging = false;
		if (editor2DViewportEl) editor2DViewportEl.style.cursor = "grab";
	};

	const on2DEditorPointerDown = (event) => {
		editor2DShowHint.value = false;
		const action = read2DEditorAction(event.target);

		if (event.pointerType === "touch") {
			editor2DActiveTouches.set(event.pointerId, {
				pointerId: event.pointerId,
				clientX: event.clientX,
				clientY: event.clientY,
			});
			event.currentTarget?.setPointerCapture?.(event.pointerId);
			if (editor2DActiveTouches.size >= 2) {
				editor2DPressedAction = null;
				editor2DGestureActive = true;
				editor2DHasManualNavigation = true;
				begin2DEditorTouchGesture();
				return;
			}
			editor2DGestureActive = false;
			start2DEditorPointerSession(
				event.pointerId,
				event.clientX,
				event.clientY,
				action,
			);
			return;
		}

		if (event.button > 2) return;

		event.preventDefault();
		start2DEditorPointerSession(
			event.pointerId,
			event.clientX,
			event.clientY,
			action,
		);
		event.currentTarget?.setPointerCapture?.(event.pointerId);
	};

	const on2DEditorPointerMove = (event) => {
		if (event.pointerType === "touch") {
			if (!editor2DActiveTouches.has(event.pointerId)) return;
			editor2DActiveTouches.set(event.pointerId, {
				pointerId: event.pointerId,
				clientX: event.clientX,
				clientY: event.clientY,
			});
			if (editor2DActiveTouches.size >= 2) {
				editor2DPressedAction = null;
				editor2DGestureActive = true;
				editor2DHasManualNavigation = true;
				update2DEditorTouchGesture();
				return;
			}

			if (event.pointerId !== editor2DPointerId) return;
			const dx = event.clientX - editor2DDragStartX;
			const dy = event.clientY - editor2DDragStartY;
			if (
				!editor2DIsDragging &&
				Math.hypot(dx, dy) < EDITOR_2D_DRAG_THRESHOLD
			) {
				return;
			}
			editor2DIsDragging = true;
			editor2DHasManualNavigation = true;
			editor2DPressedAction = null;
			set2DEditorView(
				editor2DZoom.value,
				editor2DDragStartPanX + dx,
				editor2DDragStartPanY + dy,
			);
			return;
		}

		if (event.pointerId !== editor2DPointerId) return;
		const dx = event.clientX - editor2DDragStartX;
		const dy = event.clientY - editor2DDragStartY;
		if (
			!editor2DIsDragging &&
			Math.hypot(dx, dy) < EDITOR_2D_DRAG_THRESHOLD
		) {
			return;
		}
		editor2DIsDragging = true;
		editor2DHasManualNavigation = true;
		editor2DPressedAction = null;
		set2DEditorView(
			editor2DZoom.value,
			editor2DDragStartPanX + dx,
			editor2DDragStartPanY + dy,
		);
	};

	const on2DEditorPointerFinish = (event) => {
		if (event.pointerType === "touch") {
			editor2DActiveTouches.delete(event.pointerId);
			event.currentTarget?.releasePointerCapture?.(event.pointerId);
			if (
				event.pointerId === editor2DPointerId &&
				!editor2DGestureActive &&
				!editor2DIsDragging
			) {
				perform2DEditorAction(editor2DPressedAction);
			}
			if (editor2DActiveTouches.size >= 2) {
				editor2DPressedAction = null;
				editor2DGestureActive = true;
				begin2DEditorTouchGesture();
				return;
			}
			if (editor2DActiveTouches.size === 1) {
				const [remainingPoint] = editor2DActiveTouches.values();
				editor2DGestureActive = false;
				start2DEditorPointerSession(
					remainingPoint.pointerId,
					remainingPoint.clientX,
					remainingPoint.clientY,
					null,
				);
				return;
			}
			editor2DGestureActive = false;
			finish2DEditorPointerSession();
			return;
		}

		if (event.pointerId !== editor2DPointerId) return;
		if (!editor2DIsDragging) perform2DEditorAction(editor2DPressedAction);
		finish2DEditorPointerSession();
		event.currentTarget?.releasePointerCapture?.(event.pointerId);
	};

	const on2DEditorWheel = (event) => {
		event.preventDefault();
		editor2DShowHint.value = false;
		editor2DHasManualNavigation = true;
		set2DEditorViewFromAnchor({
			nextZoom: editor2DZoom.value * Math.exp(-event.deltaY * 0.0015),
			anchorClientX: event.clientX,
			anchorClientY: event.clientY,
		});
	};

	const configPanelClass = createConfigPanelClass(
		isMobileLayout,
		mobileConfigPanelOpen,
	);
	const configPanelBodyClass = createConfigPanelBodyClass(isMobileLayout);
	const showMobileConfigOverlay = $(() => {
		const mobile = isMobileLayout.value;
		const drawerOpen = mobileConfigPanelOpen.value;
		return mobile && drawerOpen;
	});
	const appShellClass = createAppShellClass(isMobileLayout);

	const themeControls = {
		themeOptionClass,
		themeMode,
	};
	const downloadControls = {
		mobileFloatingRightStyle: MOBILE_FLOATING_RIGHT_STYLE,
		exportButtonClass,
		downloadExport,
		exportInFlight,
		exportFormatLabel,
		exportDropdownButtonClass,
		exportMenuItemClass,
		openCopyScadFromMenu,
		chooseExportFormat,
		exportFormatOptions: EXPORT_FORMAT_OPTIONS,
	};
	const previewModeControls = {
		mobileFloatingLeftStyle: MOBILE_FLOATING_LEFT_STYLE,
		previewOptionClass,
		previewMode,
	};
	const configPanelProps = {
		themeControls,
		classes: {
			configPanelClass,
			configPanelBodyClass,
		},
		constants: {
			BOARD_DIMENSION_MIN,
			TOP_COLUMN_MIN,
			STACK_COUNT_MIN,
			TILE_SIZE_MIN,
			MEASUREMENT_MIN,
			POSITIVE_MEASUREMENT_MIN,
			SEGMENTS_MIN,
			COUNTERSINK_DEGREE_MIN,
		},
		signals: {
			isMobileLayout,
			width,
			height,
			top1Text,
			top2Text,
			fullOrLite,
			stackCountValue,
			stackingMethod,
			interfaceThicknessValue,
			interfaceSeparationValue,
			screwDiameterValue,
			screwHeadDiameterValue,
			screwHeadInsetValue,
			screwHeadCountersunkDegreeValue,
			screwHeadIsCountersunk,
			backsideScrewHole,
			backsideScrewHeadDiameterShrinkValue,
			backsideScrewHeadInsetValue,
			backsideScrewHeadIsCountersunk,
			adhesiveBaseThicknessValue,
			addAdhesiveBase,
			tileSizeValue,
			tileThicknessValue,
			liteTileThicknessValue,
			heavyTileThicknessValue,
			heavyTileGapValue,
			circleSegmentsValue,
		},
		actions: {
			closeConfigPanel,
			updateSize,
			clampIntegerInput,
			clampNumberInput,
			applyTrapezoid,
			applyHelper,
			clearConfiguration,
		},
	};
	const previewPaneProps = {
		showAboutModal,
		openConfigPanel,
		exportError,
		isMobileLayout,
		isDesktopLayout,
		previewMode,
		previewMesh,
		previewLoading,
		previewError,
		resolvedTheme,
		editor2D: {
			editor2DBackgroundStyle,
			editor2DViewportClass,
			editor2DViewportStyle,
			attach2DEditorViewport,
			on2DEditorPointerDown,
			on2DEditorPointerMove,
			on2DEditorPointerFinish,
			on2DEditorWheel,
			editor2DSvgViewBox,
			editor2DSvgPreserveAspectRatio,
			editor2DSvgWidth,
			editor2DSvgHeight,
			editor2DSvgClass,
			editor2DSvgStyle,
			editor2DBoardMaterialClipId,
			editor2DNodeMaskId,
			editor2DBoardMaterialPath,
			editor2DActiveTileInsetPath,
			editor2DNodeOverlayPath,
			editor2DBoardFill,
			editor2DSceneTransform,
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
			editor2DResizeButtonFill,
			editor2DResizeButtonStroke,
			editor2DResizeButtonText,
			editor2DTopAddX,
			editor2DTopRemoveX,
			editor2DLeftControlX,
			editor2DLeftAddY,
			editor2DLeftRemoveY,
			editor2DRightControlX,
			editor2DRightAddY,
			editor2DRightRemoveY,
			editor2DBottomAddX,
			editor2DBottomRemoveX,
			editor2DTopControlY,
			editor2DBottomControlY,
			editor2DShowHint,
			editor2DHintClass,
		},
	};
	const copyModalProps = {
		showModal,
		exportText,
		close: () => (showModal.value = false),
	};
	const aboutModalProps = {
		showAboutModal,
		close: () => (showAboutModal.value = false),
	};

	return (
		<div class={appShellClass}>
			<If condition={showMobileConfigOverlay}>
				{() => (
					<div
						class="fixed inset-0 z-30 bg-slate-950/45 backdrop-blur-[1px]"
						on:click={closeConfigPanel}
					></div>
				)}
			</If>
			<ConfigPanel panel={configPanelProps} />
			<PreviewPane
				pane={previewPaneProps}
				controls={{
					theme: themeControls,
					download: downloadControls,
					previewMode: previewModeControls,
				}}
			/>
			<CopyScadModal modal={copyModalProps} />
			<AboutModal modal={aboutModalProps} />
		</div>
	);
}
