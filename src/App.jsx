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
import {
	DEFAULT_PART_ID,
	getPartMetadata,
	loadPartDefinition,
} from "./parts/index.js";

// --- Constants & Pure Utils ---

const BITS = {
	TILE: 1,
	HOLE: 2,
	CHAMFER: 4,
};

const STORAGE_KEY = "opengrid-studio-config-v3";
const LEGACY_STORAGE_KEYS = ["opengrid-mask-editor-config-v2"];
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
const DEFAULT_CONFIG = createDefaultAppConfig(DEFAULT_PART_ID);

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

function createDefaultAppConfig(partId = DEFAULT_PART_ID) {
	const metadata = getPartMetadata(partId);
	const resolvedPartId = metadata.id;
	return {
		themeMode: "auto",
		exportFormat: "stl-binary",
		partId: resolvedPartId,
		...metadata.createDefaultConfig(),
		width: 4,
		height: 4,
		top1Text: "0",
		top2Text: "0",
		maskGrid: buildRectangleMask(4, 4),
	};
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
	const activePartId = signal(DEFAULT_CONFIG.partId);
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
	const currentPartImplementation = signal(null);
	const currentPartLoadError = signal("");
	const currentEditor2D = signal(null);
	let currentPartLoadVersion = 0;
	const currentPart = $(() => {
		const implementation = currentPartImplementation.value;
		const activeId = activePartId.value;
		return implementation?.id === activeId ? implementation : null;
	});

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

	watch(() => {
		const partId = activePartId.value;
		const loadVersion = ++currentPartLoadVersion;
		currentPartLoadError.value = "";
		loadPartDefinition(partId)
			.then((part) => {
				if (loadVersion !== currentPartLoadVersion) return;
				currentPartImplementation.value = part;
			})
			.catch((error) => {
				if (loadVersion !== currentPartLoadVersion) return;
				currentPartImplementation.value = null;
				currentPartLoadError.value =
					error instanceof Error ? error.message : "Failed to load part.";
			});
	});

	const applyConfig = (config) => {
		const defaults = createDefaultAppConfig(config.partId ?? activePartId.value);
		activePartId.value = defaults.partId;
		themeMode.value = config.themeMode ?? defaults.themeMode;
		exportFormat.value = config.exportFormat ?? defaults.exportFormat;
		fullOrLite.value = config.fullOrLite ?? defaults.fullOrLite;
		tileSizeValue.value = config.tileSizeValue ?? defaults.tileSizeValue;
		tileThicknessValue.value =
			config.tileThicknessValue ?? defaults.tileThicknessValue;
		liteTileThicknessValue.value =
			config.liteTileThicknessValue ?? defaults.liteTileThicknessValue;
		heavyTileThicknessValue.value =
			config.heavyTileThicknessValue ?? defaults.heavyTileThicknessValue;
		heavyTileGapValue.value =
			config.heavyTileGapValue ?? defaults.heavyTileGapValue;
		addAdhesiveBase.value = config.addAdhesiveBase ?? defaults.addAdhesiveBase;
		adhesiveBaseThicknessValue.value =
			config.adhesiveBaseThicknessValue ?? defaults.adhesiveBaseThicknessValue;
		screwDiameterValue.value =
			config.screwDiameterValue ?? defaults.screwDiameterValue;
		screwHeadDiameterValue.value =
			config.screwHeadDiameterValue ?? defaults.screwHeadDiameterValue;
		screwHeadInsetValue.value =
			config.screwHeadInsetValue ?? defaults.screwHeadInsetValue;
		screwHeadIsCountersunk.value =
			config.screwHeadIsCountersunk ?? defaults.screwHeadIsCountersunk;
		screwHeadCountersunkDegreeValue.value =
			config.screwHeadCountersunkDegreeValue ??
			defaults.screwHeadCountersunkDegreeValue;
		backsideScrewHole.value =
			config.backsideScrewHole ?? defaults.backsideScrewHole;
		backsideScrewHeadDiameterShrinkValue.value =
			config.backsideScrewHeadDiameterShrinkValue ??
			defaults.backsideScrewHeadDiameterShrinkValue;
		backsideScrewHeadInsetValue.value =
			config.backsideScrewHeadInsetValue ?? defaults.backsideScrewHeadInsetValue;
		backsideScrewHeadIsCountersunk.value =
			config.backsideScrewHeadIsCountersunk ??
			defaults.backsideScrewHeadIsCountersunk;
		backsideScrewHeadCountersunkDegreeValue.value =
			config.backsideScrewHeadCountersunkDegreeValue ??
			defaults.backsideScrewHeadCountersunkDegreeValue;
		stackCountValue.value = config.stackCountValue ?? defaults.stackCountValue;
		stackingMethod.value = config.stackingMethod ?? defaults.stackingMethod;
		interfaceThicknessValue.value =
			config.interfaceThicknessValue ?? defaults.interfaceThicknessValue;
		interfaceSeparationValue.value =
			config.interfaceSeparationValue ?? defaults.interfaceSeparationValue;
		circleSegmentsValue.value =
			config.circleSegmentsValue ?? defaults.circleSegmentsValue;
		width.value = config.width ?? defaults.width;
		height.value = config.height ?? defaults.height;
		top1Text.value = config.top1Text ?? defaults.top1Text;
		top2Text.value = config.top2Text ?? defaults.top2Text;
		maskGrid.value = cloneGrid(config.maskGrid ?? defaults.maskGrid);
	};

	const getConfigState = () => ({
		partId: activePartId.value,
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

	watch(() => {
		exportWorker.postMessage({ type: "warmup", partId: activePartId.value });
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
		const raw =
			localStorage.getItem(STORAGE_KEY) ??
			LEGACY_STORAGE_KEYS
				.map((key) => localStorage.getItem(key))
				.find(Boolean);
		if (raw) {
			const saved = JSON.parse(raw);
			if (saved) {
				const defaults = createDefaultAppConfig(saved.partId ?? DEFAULT_PART_ID);
				nextTick(() => {
					applyConfig({
						...defaults,
						...saved,
						themeMode:
							saved.themeMode ??
							(saved.theme === "light" || saved.theme === "dark"
								? saved.theme
								: defaults.themeMode),
					});
				});
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
		partId: activePartId.value,
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
	const exportText = $(() => {
		const part = currentPart.value;
		return part?.buildExportText ? part.buildExportText(exportConfig.value) : "";
	});

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

	const renderExport = (partId, config, format) =>
		requestWorker("render-export", { partId, config, format });
	const renderPreviewMesh = (partId, config) =>
		requestWorker("preview-mesh", { partId, config });

	const downloadExport = async () => {
		if (exportInFlight.value) return;
		exportInFlight.value = true;
		exportError.value = "";
		let objectUrl = null;

		try {
			const part =
				currentPart.value ?? (await loadPartDefinition(activePartId.value));
			currentPartImplementation.value = part;
			const config = exportConfig.value;
			const format = exportFormat.value;
			const formatMeta = getExportFormatMeta(format);
			const filename = part.buildExportFilename
				? part.buildExportFilename(config, formatMeta)
				: `${part.metadata.slug || part.metadata.id}.${formatMeta.extension}`;
			const { bytes, mimeType, logs } = await renderExport(
				part.id,
				config,
				format,
			);
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
		for (const legacyKey of LEGACY_STORAGE_KEYS) localStorage.removeItem(legacyKey);
		applyConfig(createDefaultAppConfig(activePartId.value));
		queueMicrotask(() => {
			persistConfig = true;
		});
	};

	const tileSize = 56;
	const pad = 32;
	const editor2DBoardMaterialClipId = "editor-2d-board-material-clip";
	const editor2DNodeMaskId = "editor-2d-node-mask";
	const editor2DBackgroundStyle = $(() =>
		resolvedTheme.value === "dark"
			? "background: linear-gradient(180deg, #0f172a 0%, #020617 100%);"
			: "background: linear-gradient(180deg, #f8fafc 0%, #dbeafe 100%);",
	);
	const editor2DViewportContext = Object.freeze({
		signals: Object.freeze({
			width,
			height,
			maskGrid,
			topo,
			resolvedTheme,
			isMobileLayout,
		}),
		helpers: Object.freeze({
			gridSize,
			tileCoordToGrid,
			isNodePos,
			getMask,
			tileFill,
			nodeState,
		}),
		constants: Object.freeze({
			pad,
			tileSize,
			editor2DBoardMaterialClipId,
			editor2DNodeMaskId,
		}),
		actions: Object.freeze({
			readAction: read2DEditorAction,
			performAction: perform2DEditorAction,
		}),
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
	const baseEditor2DViewportProps = Object.freeze({
		backgroundStyle: editor2DBackgroundStyle,
		viewportClass: editor2DViewportClass,
		viewportStyle: editor2DViewportStyle,
		baseTileSize: tileSize,
		isWebKitEngine,
	});

	watch(() => {
		const editor = currentPart.value?.editors?.preview2D;
		if (!editor?.create) {
			currentEditor2D.value = null;
			return;
		}

		const nextEditor = editor.create(editor2DViewportContext);
		currentEditor2D.value = Object.freeze({
			...nextEditor,
			viewportProps: Object.freeze({
				...baseEditor2DViewportProps,
				sceneWidth: nextEditor.scene.svgW,
				sceneHeight: nextEditor.scene.svgH,
			}),
		});
	});

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

	const queuePreviewRender = (partId, config) => {
		if (previewTimer) clearTimeout(previewTimer);
		previewTimer = setTimeout(async () => {
			const sequence = ++previewSequence;
			previewLoading.value = true;
			previewError.value = "";

			try {
				const { mesh } = await renderPreviewMesh(partId, config);
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
		const partId = activePartId.value;
		const previewConfig = JSON.parse(previewConfigJson.value);
		if (previewMode.value !== "3d") {
			cancelPreviewRender(false);
			return;
		}
		queuePreviewRender(partId, previewConfig);
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
	const paneError = $(() => exportError.value || currentPartLoadError.value);
	const editor2DKey = $(() => (currentEditor2D.value ? activePartId.value : ""));
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
		exportError: paneError,
		isMobileLayout,
		isDesktopLayout,
		previewMode,
		previewMesh,
		previewLoading,
		previewError,
		resolvedTheme,
		editor2DKey,
		resolveEditor2D: () => currentEditor2D.value,
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
