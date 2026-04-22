import { signal, $, watch, onDispose, For, If, read } from "refui";
import RealtimePreview from "./RealtimePreview.jsx";

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
const EDITOR_2D_RESIZE_BUTTON_RADIUS = 12;
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

// --- Components ---

const OuterCornerGlyph = ({
	dir,
	x,
	y,
	chamfer,
	outerFill = "#000",
	innerFill = "#fff",
}) => {
	const outer = 13;
	const inner = 6.4;

	const isChamfer = $(() => read(chamfer));
	const direction = $(() => read(dir));

	return (
		<g>
			<If condition={$(() => direction.value === "tl")}>
				{() => (
					<g>
						<polygon
							attr:points={`${x},${y} ${x + outer},${y} ${x},${y + outer}`}
							attr:fill={outerFill}
						/>
						<If condition={isChamfer}>
							{() => (
								<polygon
									attr:points={`${x},${y} ${x + inner},${y} ${x},${y + inner}`}
									attr:fill={innerFill}
								/>
							)}
						</If>
					</g>
				)}
			</If>
			<If condition={$(() => direction.value === "tr")}>
				{() => (
					<g>
						<polygon
							attr:points={`${x},${y} ${x - outer},${y} ${x},${y + outer}`}
							attr:fill={outerFill}
						/>
						<If condition={isChamfer}>
							{() => (
								<polygon
									attr:points={`${x},${y} ${x - inner},${y} ${x},${y + inner}`}
									attr:fill={innerFill}
								/>
							)}
						</If>
					</g>
				)}
			</If>
			<If condition={$(() => direction.value === "bl")}>
				{() => (
					<g>
						<polygon
							attr:points={`${x},${y} ${x + outer},${y} ${x},${y - outer}`}
							attr:fill={outerFill}
						/>
						<If condition={isChamfer}>
							{() => (
								<polygon
									attr:points={`${x},${y} ${x + inner},${y} ${x},${y - inner}`}
									attr:fill={innerFill}
								/>
							)}
						</If>
					</g>
				)}
			</If>
			<If condition={$(() => direction.value === "br")}>
				{() => (
					<g>
						<polygon
							attr:points={`${x},${y} ${x - outer},${y} ${x},${y - outer}`}
							attr:fill={outerFill}
						/>
						<If condition={isChamfer}>
							{() => (
								<polygon
									attr:points={`${x},${y} ${x - inner},${y} ${x},${y - inner}`}
									attr:fill={innerFill}
								/>
							)}
						</If>
					</g>
				)}
			</If>
		</g>
	);
};

const EdgeGlyph = ({ state, x, y, dir, outerFill = "#000", innerFill = "#fff" }) => {
	const outer = 13;
	const inner = 6.4;
	const hole = 5.0;

	const direction = $(() => read(dir));
	const currentState = $(() => read(state));

	const points = $(() => {
		const d = direction.value;
		if (d === "up")
			return `${x - outer},${y} ${x + outer},${y} ${x},${y - outer}`;
		if (d === "down")
			return `${x - outer},${y} ${x + outer},${y} ${x},${y + outer}`;
		if (d === "left")
			return `${x},${y - outer} ${x},${y + outer} ${x - outer},${y}`;
		if (d === "right")
			return `${x},${y - outer} ${x},${y + outer} ${x + outer},${y}`;
		return "";
	});

	const innerPoints = $(() => {
		const d = direction.value;
		if (d === "up")
			return `${x - inner},${y} ${x + inner},${y} ${x},${y - inner}`;
		if (d === "down")
			return `${x - inner},${y} ${x + inner},${y} ${x},${y + inner}`;
		if (d === "left")
			return `${x},${y - inner} ${x},${y + inner} ${x - inner},${y}`;
		if (d === "right")
			return `${x},${y - inner} ${x},${y + inner} ${x + inner},${y}`;
		return "";
	});

	return (
		<g>
			<polygon attr:points={points} attr:fill={outerFill} />
			<If condition={$(() => currentState.value === "chamfer")}>
				{() => <polygon attr:points={innerPoints} attr:fill={innerFill} />}
			</If>
			<If condition={$(() => currentState.value === "hole")}>
				{() => (
					<circle attr:cx={x} attr:cy={y} attr:r={hole} attr:fill={innerFill} />
				)}
			</If>
		</g>
	);
};

const CenterGlyph = ({ state, x, y, outerFill = "#000", innerFill = "#fff" }) => {
	const outer = 13;
	const inner = 6.4;
	const hole = 5.0;

	const currentState = $(() => read(state));

	return (
		<g>
			<polygon attr:points={diamondPoints(x, y, outer)} attr:fill={outerFill} />
			<If condition={$(() => currentState.value === "chamfer")}>
				{() => (
					<polygon attr:points={diamondPoints(x, y, inner)} attr:fill={innerFill} />
				)}
			</If>
			<If condition={$(() => currentState.value === "hole")}>
				{() => (
					<circle attr:cx={x} attr:cy={y} attr:r={hole} attr:fill={innerFill} />
				)}
			</If>
		</g>
	);
};

const NodeGlyph = ({
	kind,
	state,
	x,
	y,
	dir,
	outerFill = "#000",
	innerFill = "#fff",
}) => {
	const k = $(() => read(kind));
	const currentState = $(() => read(state));
	const visible = $(() =>
		["outer", "edge", "inner", "full", "diag"].includes(k.value),
	);
	return (
		<g>
			<If condition={visible}>
				{() => (
					<CenterGlyph
						state={currentState}
						x={x}
						y={y}
						outerFill={outerFill}
						innerFill={innerFill}
					/>
				)}
			</If>
		</g>
	);
};

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
			if (saved)
				applyConfig({
					...DEFAULT_CONFIG,
					...saved,
					themeMode:
						saved.themeMode ??
						(saved.theme === "light" || saved.theme === "dark"
							? saved.theme
							: DEFAULT_CONFIG.themeMode),
				});
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

	const Editor2DResizeButton = ({ cx, cy, label, action }) => (
		<g
			attr:data-editor-action={action}
			style="cursor: pointer;"
		>
			<circle
				attr:cx={cx}
				attr:cy={cy}
				attr:r={EDITOR_2D_RESIZE_BUTTON_RADIUS}
				attr:fill={editor2DResizeButtonFill}
				attr:stroke={editor2DResizeButtonStroke}
				attr:stroke-width="1.5"
			/>
			<text
				attr:x={cx}
				attr:y={cy}
				attr:fill={editor2DResizeButtonText}
				attr:text-anchor="middle"
				attr:dominant-baseline="central"
				attr:font-size="15"
				attr:font-weight="700"
				style="pointer-events: none; user-select: none;"
			>
				{label}
			</text>
		</g>
	);

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

	const svgW = $(() => width.value * tileSize + pad * 2);
	const svgH = $(() => height.value * tileSize + pad * 2);
	const boardW = $(() => width.value * tileSize);
	const boardH = $(() => height.value * tileSize);
	const get2DEditorViewMetrics = (zoom = editor2DZoom.value) => {
		const contentWidth = svgW.value;
		const contentHeight = svgH.value;
		const viewportWidth = Math.max(editor2DViewportWidth.value, 1);
		const viewportHeight = Math.max(editor2DViewportHeight.value, 1);
		const viewportAspect = viewportWidth / viewportHeight;
		const contentAspect = contentWidth / Math.max(contentHeight, 1);
		const fitWidth =
			viewportAspect > contentAspect
				? contentHeight * viewportAspect
				: contentWidth;
		const fitHeight =
			viewportAspect > contentAspect
				? contentHeight
				: contentWidth / Math.max(viewportAspect, 0.0001);
		const nextZoom = clamp(zoom, EDITOR_2D_MIN_ZOOM, EDITOR_2D_MAX_ZOOM);
		const viewWidth = fitWidth / nextZoom;
		const viewHeight = fitHeight / nextZoom;
		return {
			contentWidth,
			contentHeight,
			fitWidth,
			fitHeight,
			viewWidth,
			viewHeight,
			maxPanX: Math.max(0, (fitWidth - viewWidth) / 2),
			maxPanY: Math.max(0, (fitHeight - viewHeight) / 2),
		};
	};
	const get2DEditorViewFrame = (
		zoom = editor2DZoom.value,
		panX = editor2DPanX.value,
		panY = editor2DPanY.value,
	) => {
		const metrics = get2DEditorViewMetrics(zoom);
		const clampedPanX = clamp(panX, -metrics.maxPanX, metrics.maxPanX);
		const clampedPanY = clamp(panY, -metrics.maxPanY, metrics.maxPanY);
		const centerX = metrics.contentWidth / 2 + clampedPanX;
		const centerY = metrics.contentHeight / 2 + clampedPanY;
		return {
			...metrics,
			panX: clampedPanX,
			panY: clampedPanY,
			left: centerX - metrics.viewWidth / 2,
			top: centerY - metrics.viewHeight / 2,
		};
	};
	const set2DEditorView = (
		zoom = editor2DZoom.value,
		panX = editor2DPanX.value,
		panY = editor2DPanY.value,
	) => {
		const nextZoom = clamp(zoom, EDITOR_2D_MIN_ZOOM, EDITOR_2D_MAX_ZOOM);
		const frame = get2DEditorViewFrame(nextZoom, panX, panY);
		editor2DZoom.value = nextZoom;
		editor2DPanX.value = frame.panX;
		editor2DPanY.value = frame.panY;
	};
	const get2DEditorInitialZoom = () => {
		const metrics = get2DEditorViewMetrics(1);
		const fitScale = Math.min(
			editor2DViewportWidth.value / Math.max(metrics.fitWidth, 1),
			editor2DViewportHeight.value / Math.max(metrics.fitHeight, 1),
		);
		const tilePixelsAtFit = tileSize * fitScale;
		if (tilePixelsAtFit <= EDITOR_2D_INITIAL_MAX_TILE_PX) return 1;
		return clamp(
			EDITOR_2D_INITIAL_MAX_TILE_PX / Math.max(tilePixelsAtFit, 1),
			EDITOR_2D_MIN_ZOOM,
			1,
		);
	};
	const fit2DEditorInitialView = () => {
		if (editor2DViewportWidth.value <= 1 || editor2DViewportHeight.value <= 1)
			return;
		set2DEditorView(get2DEditorInitialZoom(), 0, 0);
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
		const widthPx = Math.max(rect.width, 1);
		const heightPx = Math.max(rect.height, 1);
		const anchorRatioX = clamp(
			(anchorClientX - rect.left) / widthPx,
			0,
			1,
		);
		const anchorRatioY = clamp(
			(anchorClientY - rect.top) / heightPx,
			0,
			1,
		);
		const targetRatioX = clamp(
			(targetClientX - rect.left) / widthPx,
			0,
			1,
		);
		const targetRatioY = clamp(
			(targetClientY - rect.top) / heightPx,
			0,
			1,
		);
		const sourceFrame = get2DEditorViewFrame(baseZoom, basePanX, basePanY);
		const anchorX = sourceFrame.left + anchorRatioX * sourceFrame.viewWidth;
		const anchorY = sourceFrame.top + anchorRatioY * sourceFrame.viewHeight;
		const nextMetrics = get2DEditorViewMetrics(nextZoom);
		const nextCenterX =
			anchorX + (0.5 - targetRatioX) * nextMetrics.viewWidth;
		const nextCenterY =
			anchorY + (0.5 - targetRatioY) * nextMetrics.viewHeight;
		set2DEditorView(
			nextZoom,
			nextCenterX - nextMetrics.contentWidth / 2,
			nextCenterY - nextMetrics.contentHeight / 2,
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
	const editor2DViewBox = $(() => {
		const frame = get2DEditorViewFrame(
			editor2DZoom.value,
			editor2DPanX.value,
			editor2DPanY.value,
		);
		return `${frame.left} ${frame.top} ${frame.viewWidth} ${frame.viewHeight}`;
	});
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
	const editor2DTopControlY = pad / 2;
	const editor2DLeftControlX = pad / 2;
	const editor2DRightControlX = $(() => svgW.value - pad / 2);
	const editor2DBottomControlY = $(() => svgH.value - pad / 2);
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
			? "pointer-events-none absolute left-1/2 bottom-20 z-10 w-[min(calc(100%-2rem),320px)] -translate-x-1/2 rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-center text-[11px] font-medium text-slate-500 backdrop-blur dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-400"
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

	const inputClass =
		"border border-gray-200 rounded-lg h-9 px-3 text-sm text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-400/20";
	const compactInputClass =
		"border border-gray-200 rounded-lg h-8 px-2 text-xs text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-400/20";
	const sectionClass =
		"grid gap-4 border-t border-gray-200 pt-6 dark:border-slate-800";
	const sectionTitleClass =
		"text-[10px] font-bold uppercase tracking-widest text-blue-600/70 dark:text-blue-300/80";
	const fieldLabelClass =
		"text-[10px] font-bold text-gray-400 uppercase tracking-tighter dark:text-slate-500";
	const formLabelClass =
		"text-xs font-medium text-gray-500 dark:text-slate-400";
	const toggleLabelClass =
		"flex items-center gap-2 text-sm font-medium text-gray-600 cursor-pointer dark:text-slate-300";
	const chipButtonClass =
		"bg-gray-100 text-gray-600 rounded-lg py-1.5 px-3 text-[10px] font-bold uppercase hover:bg-gray-200 transition tracking-tight dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";
	const iconButtonClass =
		"w-6 h-6 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded text-gray-700 font-bold text-xs transition dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700";
	const aboutButtonClass =
		"h-10 pr-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition flex items-center dark:text-slate-400 dark:hover:text-slate-200";
	const primaryButtonClass =
		"bg-blue-600 text-white rounded-xl h-10 px-4 text-sm font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-lg shadow-blue-600/20 dark:bg-blue-500 dark:hover:bg-blue-400";
	const modalActionClass =
		"bg-gray-100 text-gray-700 rounded-xl px-4 h-11 font-bold hover:bg-gray-200 transition dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700";
	const modalPrimaryActionClass =
		"bg-blue-600 text-white rounded-xl px-4 h-11 font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20 dark:bg-blue-500 dark:hover:bg-blue-400";
	const themeBarClass =
		"inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 h-10 dark:border-slate-700 dark:bg-slate-900";
	const mobileThemeBarClass =
		"grid h-auto grid-cols-3 rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-slate-700 dark:bg-slate-900";
	const themeOptionClass = (mode) =>
		$(() => {
			const active = themeMode.value === mode;
			return [
				"rounded-lg px-3 h-7.5 text-xs font-bold uppercase tracking-wider transition",
				active
					? "bg-white text-gray-900 shadow-sm dark:bg-slate-800 dark:text-slate-100"
					: "text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200",
			].join(" ");
		});
	const previewBarClass =
		"inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 h-10 dark:border-slate-700 dark:bg-slate-900";
	const previewOptionClass = (mode) =>
		$(() => {
			const active = previewMode.value === mode;
			return [
				"rounded-lg px-3 h-7.5 text-xs font-bold uppercase tracking-wider transition",
				active
					? "bg-white text-gray-900 shadow-sm dark:bg-slate-800 dark:text-slate-100"
					: "text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200",
			].join(" ");
		});
	const exportFormatLabel = $(
		() => getExportFormatMeta(exportFormat.value).label,
	);
	const exportButtonClass = $(() =>
		[
			primaryButtonClass,
			"rounded-r-none",
			exportInFlight.value ? "cursor-wait opacity-70" : "",
		].join(" "),
	);
	const exportDropdownButtonClass = $(() =>
		[
			"flex items-center justify-center bg-blue-600 text-white rounded-r-xl rounded-l-none h-10 px-2 leading-none hover:bg-blue-700 transition border-l border-blue-500/70 shadow-lg shadow-blue-600/20 dark:bg-blue-500 dark:hover:bg-blue-400 dark:border-blue-400/40",
			exportInFlight.value ? "cursor-wait opacity-70 pointer-events-none" : "",
		].join(" "),
	);
	const exportMenuClass =
		"absolute right-0 top-full z-30 mt-2 min-w-40 rounded-xl border border-gray-200 bg-white p-1 shadow-[0_12px_30px_rgba(15,23,42,0.14)] dark:border-slate-700 dark:bg-slate-900";
	const exportMenuAboveClass =
		"absolute bottom-full right-0 z-30 mb-2 min-w-40 rounded-xl border border-gray-200 bg-white p-1 shadow-[0_12px_30px_rgba(15,23,42,0.14)] dark:border-slate-700 dark:bg-slate-900";
	const exportMenuItemClass = (format) =>
		$(() =>
			[
				"flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold transition",
				exportFormat.value === format
					? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"
					: "text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800",
			].join(" "),
		);

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
		const frame = get2DEditorViewFrame(
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
			const frame = get2DEditorViewFrame(
				editor2DZoom.value,
				editor2DDragStartPanX,
				editor2DDragStartPanY,
			);
			set2DEditorView(
				editor2DZoom.value,
				editor2DDragStartPanX -
					dx * (frame.viewWidth / Math.max(editor2DViewportWidth.value, 1)),
				editor2DDragStartPanY -
					dy * (frame.viewHeight / Math.max(editor2DViewportHeight.value, 1)),
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
		const frame = get2DEditorViewFrame(
			editor2DZoom.value,
			editor2DDragStartPanX,
			editor2DDragStartPanY,
		);
		set2DEditorView(
			editor2DZoom.value,
			editor2DDragStartPanX -
				dx * (frame.viewWidth / Math.max(editor2DViewportWidth.value, 1)),
			editor2DDragStartPanY -
				dy * (frame.viewHeight / Math.max(editor2DViewportHeight.value, 1)),
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

	const configPanelClass = $(() => {
		const mobile = isMobileLayout.value;
		const drawerOpen = mobileConfigPanelOpen.value;
		return [
			"bg-gray-50 border-gray-200 flex flex-col z-40 dark:bg-slate-950 dark:border-slate-800",
			mobile
				? [
						"fixed inset-y-0 left-0 w-[min(92vw,400px)] max-w-full border-r shadow-[0_24px_80px_rgba(15,23,42,0.28)] transition-transform duration-200 ease-out",
						drawerOpen ? "translate-x-0" : "-translate-x-full",
					].join(" ")
				: "w-[400px] min-w-[400px] shrink-0 h-full overflow-auto border-r",
		].join(" ");
	});
	const configPanelBodyClass = $(() =>
		[
			"h-full overflow-auto flex flex-col gap-8",
			isMobileLayout.value ? "p-5" : "p-8",
		].join(" "),
	);
	const showMobileConfigOverlay = $(() => {
		const mobile = isMobileLayout.value;
		const drawerOpen = mobileConfigPanelOpen.value;
		return mobile && drawerOpen;
	});
	const appShellClass = $(() =>
		[
			"h-screen flex overflow-hidden font-sans bg-white text-gray-900 dark:bg-slate-950 dark:text-slate-100",
			isMobileLayout.value ? "flex-col" : "flex-row",
		].join(" "),
	);

	const ThemeSwitcher = ({ mobile = false }) => (
		<div class={mobile ? `grid gap-3 ${sectionClass}` : "inline-flex"}>
			<If condition={() => mobile}>
				{() => <div class={sectionTitleClass}>Appearance</div>}
			</If>
			<div class={mobile ? mobileThemeBarClass : themeBarClass}>
				<button
					class={
						mobile
							? $(() => `${themeOptionClass("auto").value} w-full justify-center`)
							: themeOptionClass("auto")
					}
					on:click={() => (themeMode.value = "auto")}
				>
					Auto
				</button>
				<button
					class={
						mobile
							? $(() =>
									`${themeOptionClass("light").value} w-full justify-center`,
							  )
							: themeOptionClass("light")
					}
					on:click={() => (themeMode.value = "light")}
				>
					Light
				</button>
				<button
					class={
						mobile
							? $(() => `${themeOptionClass("dark").value} w-full justify-center`)
							: themeOptionClass("dark")
					}
					on:click={() => (themeMode.value = "dark")}
				>
					Dark
				</button>
			</div>
		</div>
	);

	const DownloadActions = ({ mobile = false }) => (
		<div
			class={
				mobile
					? "fixed bottom-4 right-4 z-20 flex items-stretch"
					: "relative flex items-stretch"
			}
		>
			<button
				class={exportButtonClass}
				on:click={downloadExport}
				prop:disabled={exportInFlight}
			>
				{$(() =>
					exportInFlight.value
						? `Rendering ${exportFormatLabel.value}...`
						: `Download ${exportFormatLabel.value}`,
				)}
			</button>
			<details class="js-export-menu relative">
				<summary
					class={exportDropdownButtonClass}
					style="list-style: none;"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 16 16"
						class="h-4 w-4 fill-current"
					>
						<path d="M4.22 6.97a.75.75 0 0 1 1.06 0L8 9.69l2.72-2.72a.75.75 0 1 1 1.06 1.06L8.53 11.28a.75.75 0 0 1-1.06 0L4.22 8.03a.75.75 0 0 1 0-1.06Z" />
					</svg>
				</summary>
				<div class={mobile ? exportMenuAboveClass : exportMenuClass}>
					<button
						class={exportMenuItemClass("__copy_scad__")}
						on:click={openCopyScadFromMenu}
					>
						Copy SCAD
					</button>
					{EXPORT_FORMAT_OPTIONS.map((option) => (
						<button
							class={exportMenuItemClass(option.value)}
							on:click={(event) => chooseExportFormat(option.value, event)}
						>
							{option.label}
						</button>
					))}
				</div>
			</details>
		</div>
	);

	const PreviewModeSwitcher = ({ mobile = false }) => (
		<div
			class={
				mobile
					? "pointer-events-auto absolute bottom-4 left-4 z-20"
					: "block"
			}
		>
			<div class={previewBarClass}>
				<button
					class={previewOptionClass("2d")}
					on:click={() => (previewMode.value = "2d")}
				>
					2D
				</button>
				<button
					class={previewOptionClass("3d")}
					on:click={() => (previewMode.value = "3d")}
				>
					3D
				</button>
			</div>
		</div>
	);

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
			{/* Left: Config */}
			<div class={configPanelClass}>
				<div class={configPanelBodyClass}>
					<div>
						<div class="mb-4 sm:mb-6 flex items-center justify-between gap-3">
							<h2 class="text-lg sm:text-xl font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2">
								<div class="w-2 h-5 sm:h-6 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
								Configuration
							</h2>
							<If condition={isMobileLayout}>
								{() => (
									<button
										class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
										on:click={closeConfigPanel}
										aria-label="Close configuration"
									>
										<svg
											aria-hidden="true"
											viewBox="0 0 20 20"
											class="h-5 w-5 fill-none stroke-current"
											stroke-width="1.8"
											stroke-linecap="round"
										>
											<path d="M5.5 5.5l9 9" />
											<path d="M14.5 5.5l-9 9" />
										</svg>
									</button>
								)}
							</If>
						</div>

						<div class="grid gap-6">
							<If condition={isMobileLayout}>
								{() => <ThemeSwitcher mobile />}
							</If>
							<div class="grid gap-4">
								<div class={sectionTitleClass}>Shape Helpers</div>
								<div class="grid grid-cols-2 gap-3">
									<div class="grid gap-1">
										<label class={formLabelClass}>Width</label>
										<input
											type="number"
											class={inputClass}
											min={BOARD_DIMENSION_MIN}
											value={width}
											on:input={(e) =>
												updateSize(
													clampIntegerInput(
														e.target.value,
														BOARD_DIMENSION_MIN,
														Infinity,
														width.value,
													),
													height.value,
												)
											}
										/>
									</div>
									<div class="grid gap-1">
										<label class={formLabelClass}>Height</label>
										<input
											type="number"
											class={inputClass}
											min={BOARD_DIMENSION_MIN}
											value={height}
											on:input={(e) =>
												updateSize(
													width.value,
													clampIntegerInput(
														e.target.value,
														BOARD_DIMENSION_MIN,
														Infinity,
														height.value,
													),
												)
											}
										/>
									</div>
									{/*<button class="bg-blue-600 text-white rounded-lg h-9 px-4 text-sm font-semibold hover:bg-blue-700 transition" on:click={applyRectangle}>Rectangle</button>*/}
								</div>
								<div class="grid grid-cols-2 gap-3">
									<div class="grid gap-1">
										<label class={formLabelClass}>Top col 1</label>
										<input
											type="number"
											class={inputClass}
											min={TOP_COLUMN_MIN}
											max={width}
											value={top1Text}
											on:input={(e) =>
												(top1Text.value = String(
													clampIntegerInput(
														e.target.value,
														TOP_COLUMN_MIN,
														width.value,
														Number(top1Text.value) || TOP_COLUMN_MIN,
													),
												))
											}
										/>
									</div>
									<div class="grid gap-1">
										<label class={formLabelClass}>Top col 2</label>
										<input
											type="number"
											class={inputClass}
											min={TOP_COLUMN_MIN}
											max={width}
											value={top2Text}
											on:input={(e) =>
												(top2Text.value = String(
													clampIntegerInput(
														e.target.value,
														TOP_COLUMN_MIN,
														width.value,
														Number(top2Text.value) || TOP_COLUMN_MIN,
													),
												))
											}
										/>
									</div>
									<button
										class="bg-blue-600 border border-blue-600 text-white rounded-lg h-9 px-4 text-sm font-semibold hover:bg-blue-700 transition col-span-2 dark:bg-blue-500 dark:border-blue-500 dark:hover:bg-blue-400"
										on:click={applyTrapezoid}
									>
										Apply
									</button>
								</div>
							</div>

							<div class={sectionClass}>
								<div class={sectionTitleClass}>Presets</div>
								<div class="flex flex-wrap gap-2">
									{[
										{ label: "Screws", mode: "holes_all" },
										{ label: "Connectors", mode: "connectors_edge" },
										{ label: "Chamfers", mode: "chamfer_all" },
										{ label: "Clear", mode: "clear_all" },
									].map(({ label, mode }) => (
										<button
											class={chipButtonClass}
											on:click={() => applyHelper(mode)}
										>
											{label}
										</button>
									))}
								</div>
							</div>

							<div class={sectionClass}>
								<div class={sectionTitleClass}>Board Type</div>
								<div class="flex gap-4">
									{["Full", "Lite", "Heavy"].map((v) => (
										<label class="flex items-center gap-2 cursor-pointer group">
											<input
												type="radio"
												class="w-4 h-4 text-blue-600 focus:ring-blue-500/20 border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:focus:ring-blue-400/20"
												checked={fullOrLite.eq(v)}
												on:change={() => (fullOrLite.value = v)}
											/>
											<span class="text-sm font-medium text-gray-600 group-hover:text-blue-600 transition dark:text-slate-300 dark:group-hover:text-blue-300">
												{v}
											</span>
										</label>
									))}
								</div>
							</div>

							<div class={sectionClass}>
								<div class={sectionTitleClass}>Stacking</div>
								<div class="grid grid-cols-2 gap-x-4 gap-y-3">
									<div class="grid gap-1">
										<label class={fieldLabelClass}>Stack Count</label>
										<input
											type="number"
											class={compactInputClass}
											min={STACK_COUNT_MIN}
											value={stackCountValue}
											on:input={(e) =>
												(stackCountValue.value = clampIntegerInput(
													e.target.value,
													STACK_COUNT_MIN,
													Infinity,
													stackCountValue.value,
												))
											}
										/>
									</div>
									<div class="grid gap-1">
										<label class={fieldLabelClass}>Method</label>
										<select
											class={compactInputClass}
											value={stackingMethod}
											on:change={(e) => (stackingMethod.value = e.target.value)}
										>
											<option>Interface Layer</option>
											<option>Ironing - BETA</option>
										</select>
									</div>
									<div class="grid gap-1">
										<label class={fieldLabelClass}>Interface Thickness</label>
										<input
											type="number"
											class={compactInputClass}
											step={0.1}
											min={MEASUREMENT_MIN}
											value={interfaceThicknessValue}
											on:input={(e) =>
												(interfaceThicknessValue.value =
													clampNumberInput(
														e.target.value,
														MEASUREMENT_MIN,
														Infinity,
														interfaceThicknessValue.value,
													))
											}
										/>
									</div>
									<div class="grid gap-1">
										<label class={fieldLabelClass}>Separation</label>
										<input
											type="number"
											class={compactInputClass}
											step={0.1}
											min={MEASUREMENT_MIN}
											value={interfaceSeparationValue}
											on:input={(e) =>
												(interfaceSeparationValue.value =
													clampNumberInput(
														e.target.value,
														MEASUREMENT_MIN,
														Infinity,
														interfaceSeparationValue.value,
													))
											}
										/>
									</div>
								</div>
							</div>

							<div class={sectionClass}>
								<div class={sectionTitleClass}>Screws</div>
								<div class="grid grid-cols-2 gap-x-4 gap-y-3">
									{[
										{
											label: "Screw Diameter",
											step: 0.1,
											sig: screwDiameterValue,
											min: POSITIVE_MEASUREMENT_MIN,
										},
										{
											label: "Head Diameter",
											step: 0.1,
											sig: screwHeadDiameterValue,
											min: POSITIVE_MEASUREMENT_MIN,
										},
										{
											label: "Head Inset",
											step: 0.1,
											sig: screwHeadInsetValue,
											min: MEASUREMENT_MIN,
										},
										{
											label: "Sink Deg",
											step: 0.1,
											sig: screwHeadCountersunkDegreeValue,
											min: COUNTERSINK_DEGREE_MIN,
										},
									].map(({ label, sig, step, min, max }) => (
										<div class="grid gap-1">
											<label class={fieldLabelClass}>{label}</label>
											<input
												type="number"
												class={compactInputClass}
												step={step}
												min={min}
												value={sig}
												on:input={(e) =>
													(sig.value = clampNumberInput(
														e.target.value,
														min,
														max ?? Infinity,
														sig.value,
													))
												}
											/>
										</div>
									))}
								</div>
								<label class={toggleLabelClass}>
									<input
										type="checkbox"
										class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:focus:ring-blue-400/20"
										checked={screwHeadIsCountersunk}
										on:change={(e) =>
											(screwHeadIsCountersunk.value = e.target.checked)
										}
									/>
									Countersunk
								</label>
							</div>

							<If condition={fullOrLite.eq("Full")}>
								{() => (
									<div class={sectionClass}>
										<div class={sectionTitleClass}>Backside Screws</div>
										<label class={toggleLabelClass}>
											<input
												type="checkbox"
												class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:focus:ring-blue-400/20"
												checked={backsideScrewHole}
												on:change={(e) =>
													(backsideScrewHole.value = e.target.checked)
												}
											/>
											Enable backside
										</label>
										<div class="grid grid-cols-2 gap-x-4 gap-y-3">
											{[
												{
													label: "Head Shrink",
													step: 0.1,
													sig: backsideScrewHeadDiameterShrinkValue,
													min: MEASUREMENT_MIN,
												},
												{
													label: "Head Inset",
													step: 0.1,
													sig: backsideScrewHeadInsetValue,
													min: MEASUREMENT_MIN,
												},
											].map(({ label, sig, step, min, max }) => (
												<div class="grid gap-1">
													<label class={fieldLabelClass}>{label}</label>
													<input
														type="number"
														class={compactInputClass}
														step={step}
														min={min}
														value={sig}
														on:input={(e) =>
															(sig.value = clampNumberInput(
																e.target.value,
																min,
																max ?? Infinity,
																sig.value,
															))
														}
													/>
												</div>
											))}
										</div>
										<label class={toggleLabelClass}>
											<input
												type="checkbox"
												class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:focus:ring-blue-400/20"
												checked={backsideScrewHeadIsCountersunk}
												on:change={(e) =>
													(backsideScrewHeadIsCountersunk.value =
														e.target.checked)
												}
											/>
											Backside countersunk
										</label>
									</div>
								)}
							</If>

							<If condition={fullOrLite.eq("Lite")}>
								{() => (
									<div class={sectionClass}>
										<div class={sectionTitleClass}>Adhesive Base</div>
										<label class={toggleLabelClass}>
											<input
												type="checkbox"
												class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:focus:ring-blue-400/20"
												checked={addAdhesiveBase}
												on:change={(e) =>
													(addAdhesiveBase.value = e.target.checked)
												}
											/>
											Enable base
										</label>
										<div class="grid gap-1">
											<label class={fieldLabelClass}>Thickness</label>
										<input
											type="number"
											class={compactInputClass}
											min={MEASUREMENT_MIN}
											value={adhesiveBaseThicknessValue}
											on:input={(e) =>
												(adhesiveBaseThicknessValue.value =
													clampNumberInput(
														e.target.value,
														MEASUREMENT_MIN,
														Infinity,
														adhesiveBaseThicknessValue.value,
													))
											}
										/>
										</div>
									</div>
								)}
							</If>

							<div class={sectionClass}>
								<div class={sectionTitleClass}>Dimensions</div>
								<div class="grid grid-cols-2 gap-x-4 gap-y-3">
									{[
										{
											label: "Tile Size",
											step: 1,
											sig: tileSizeValue,
											min: TILE_SIZE_MIN,
											integer: true,
										},
										{
											label: "Thickness",
											type: "Full",
											step: 0.1,
											sig: tileThicknessValue,
											min: POSITIVE_MEASUREMENT_MIN,
										},
										{
											label: "Lite Thickness",
											type: "Lite",
											step: 0.1,
											sig: liteTileThicknessValue,
											min: POSITIVE_MEASUREMENT_MIN,
										},
										{
											label: "Heavy Thickness",
											type: "Heavy",
											step: 0.1,
											sig: heavyTileThicknessValue,
											min: POSITIVE_MEASUREMENT_MIN,
										},
										{
											label: "Heavy Gap",
											type: "Heavy",
											step: 0.1,
											sig: heavyTileGapValue,
											min: MEASUREMENT_MIN,
										},
									].map(({ label, type, sig, step, min, max, integer }) => (
										<If
											condition={() =>
												type ? fullOrLite.value === type : true
											}
										>
											{() => (
												<div class="grid gap-1">
													<label class={fieldLabelClass}>{label}</label>
													<input
														type="number"
														class={compactInputClass}
														step={step}
														min={min}
														value={sig}
														on:input={(e) =>
															(sig.value = integer
																? clampIntegerInput(
																	e.target.value,
																	min,
																	max ?? Infinity,
																	sig.value,
																)
																: clampNumberInput(
																	e.target.value,
																	min,
																	max ?? Infinity,
																	sig.value,
																))
														}
													/>
												</div>
											)}
										</If>
									))}
								</div>
							</div>

							<div class={sectionClass}>
								<div class={sectionTitleClass}>Quality</div>
								<div class="grid grid-cols-2 gap-x-4 gap-y-3">
									<div class="grid gap-1">
										<label class={fieldLabelClass}>Segments</label>
										<input
											type="number"
											class={compactInputClass}
											min={SEGMENTS_MIN}
											value={circleSegmentsValue}
											on:input={(e) =>
												(circleSegmentsValue.value =
													clampIntegerInput(
														e.target.value,
														SEGMENTS_MIN,
														Infinity,
														circleSegmentsValue.value,
													))
											}
										/>
									</div>
								</div>
							</div>

							<div class="grid gap-3 border-t border-gray-200 pt-4 dark:border-slate-800">
								<button class={chipButtonClass} on:click={clearConfiguration}>
									Clear Saved Config
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Right: Preview Area */}
			<div class="flex-1 min-w-0 flex flex-col h-full bg-white relative dark:bg-slate-950">
				{/* Title Bar */}
				<div class="border-b border-gray-200 bg-white z-20 shadow-sm dark:border-slate-800 dark:bg-slate-950">
					<div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-6 sm:py-3 lg:px-8">
						<div class="flex min-w-0 flex-wrap items-center gap-2 sm:gap-4">
							<If condition={isMobileLayout}>
								{() => (
									<button
										class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
										on:click={openConfigPanel}
										aria-label="Open configuration"
									>
										<svg
											aria-hidden="true"
											viewBox="0 0 20 20"
											class="h-5 w-5 fill-none stroke-current"
											stroke-width="1.8"
											stroke-linecap="round"
										>
											<path d="M3.5 5.5h13" />
											<path d="M3.5 10h13" />
											<path d="M3.5 14.5h13" />
										</svg>
									</button>
								)}
							</If>
							<img
								src="/logo.png"
								alt="openGrid Studio logo"
								class="h-7 w-7 rounded-lg object-contain shadow-lg shadow-blue-500/20 sm:h-8 sm:w-8"
							/>
							<h1 class="text-sm sm:text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-slate-400">
								openGrid Studio
							</h1>
							<button
								class={aboutButtonClass}
								on:click={() => (showAboutModal.value = true)}
							>
								ⓘ
							</button>
							<If condition={isDesktopLayout}>
								{() => <PreviewModeSwitcher />}
							</If>
						</div>
						<If condition={isDesktopLayout}>
							{() => (
								<div class="flex w-full flex-wrap gap-2 items-center sm:w-auto sm:justify-end">
									<ThemeSwitcher />
									<DownloadActions />
								</div>
							)}
						</If>
					</div>
				</div>
				<If condition={exportError}>
					{() => (
						<div class="px-4 sm:px-6 lg:px-8 py-3 border-b border-rose-200 bg-rose-50 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
							{exportError}
						</div>
					)}
				</If>

				{/* Editor Surface */}
				<If condition={previewMode.eq("2d")}>
					{() => (
						<div class="flex-1 min-h-0 relative overflow-hidden bg-white dark:bg-slate-950">
							<div class="absolute inset-0" style={editor2DBackgroundStyle}></div>
							<div
								class="absolute inset-0 cursor-grab select-none"
								style="touch-action: none;"
								$ref={attach2DEditorViewport}
								on:contextmenu={(event) => event.preventDefault()}
								on:pointerdown={on2DEditorPointerDown}
								on:pointermove={on2DEditorPointerMove}
								on:pointerup={on2DEditorPointerFinish}
								on:pointercancel={on2DEditorPointerFinish}
								on:wheel={on2DEditorWheel}
							>
								<svg
									attr:viewBox={editor2DViewBox}
									attr:preserveAspectRatio="xMidYMid meet"
									class="block h-full w-full"
									style="background: transparent;"
								>
												<defs>
													<clipPath
														attr:id={editor2DBoardMaterialClipId}
														attr:clipPathUnits="userSpaceOnUse"
													>
														<path attr:d={editor2DBoardMaterialPath} />
													</clipPath>
													<mask
														attr:id={editor2DNodeMaskId}
														attr:maskUnits="userSpaceOnUse"
														attr:maskContentUnits="userSpaceOnUse"
														attr:x="0"
														attr:y="0"
														attr:width={svgW}
														attr:height={svgH}
													>
														<rect
															attr:x="0"
															attr:y="0"
															attr:width={svgW}
															attr:height={svgH}
															attr:fill="white"
														/>

														<For entries={nodes} track="id">
															{({ item: { gx, gy } }) => {
																const { x, y } = toNodeXY(gx, gy);
																const kind = $(
																	() => topo.value.nodeKind[gy]?.[gx] ?? "none",
																);
																const dir = $(
																	() => topo.value.nodeDir[gy]?.[gx] ?? null,
																);
																const state = $(() =>
																	nodeState(
																		kind.value,
																		getMask(maskGrid.value, gx, gy),
																	),
																);
																return (
																	<NodeGlyph
																		kind={kind}
																		state={state}
																		x={x}
																		y={y}
																		dir={dir}
																		outerFill="none"
																		innerFill="black"
																	/>
																);
															}}
														</For>
													</mask>
												</defs>

												<g attr:mask={`url(#${editor2DNodeMaskId})`}>
													<If condition={$(() => !!editor2DBoardMaterialPath.value)}>
														{() => (
															<path
																attr:d={editor2DBoardMaterialPath}
																attr:fill={editor2DBoardFill}
															/>
														)}
													</If>
													<If condition={$(() => !!editor2DActiveTileInsetPath.value)}>
														{() => (
															<path
																attr:d={editor2DActiveTileInsetPath}
																attr:fill="#2563eb"
															/>
														)}
													</If>
													<If condition={$(() => !!editor2DNodeOverlayPath.value)}>
														{() => (
															<path
																attr:d={editor2DNodeOverlayPath}
																attr:fill={editor2DBoardFill}
																attr:clip-path={`url(#${editor2DBoardMaterialClipId})`}
															/>
														)}
													</If>
												</g>

												<For entries={tiles} track="id">
													{({ item: { tx, ty, gx, gy } }) => (
														<rect
															attr:data-editor-action="tile"
															attr:data-gx={gx}
															attr:data-gy={gy}
															attr:x={pad + tx * tileSize}
															attr:y={pad + ty * tileSize}
															attr:width={tileSize}
															attr:height={tileSize}
															attr:fill="transparent"
														/>
													)}
												</For>

												<For entries={nodes} track="id">
													{({ item: { gx, gy } }) => {
														const { x, y } = toNodeXY(gx, gy);
														return (
															<circle
																attr:data-editor-action="node"
																attr:data-gx={gx}
																attr:data-gy={gy}
																attr:cx={x}
																attr:cy={y}
																attr:r={20}
																attr:fill="transparent"
															/>
														);
													}}
												</For>

												<Editor2DResizeButton
													cx={editor2DTopAddX}
													cy={editor2DTopControlY}
													label="+"
													action="top-add"
												/>
												<Editor2DResizeButton
													cx={editor2DTopRemoveX}
													cy={editor2DTopControlY}
													label="-"
													action="top-remove"
												/>
												<Editor2DResizeButton
													cx={editor2DLeftControlX}
													cy={editor2DLeftAddY}
													label="+"
													action="left-add"
												/>
												<Editor2DResizeButton
													cx={editor2DLeftControlX}
													cy={editor2DLeftRemoveY}
													label="-"
													action="left-remove"
												/>
												<Editor2DResizeButton
													cx={editor2DRightControlX}
													cy={editor2DRightAddY}
													label="+"
													action="right-add"
												/>
												<Editor2DResizeButton
													cx={editor2DRightControlX}
													cy={editor2DRightRemoveY}
													label="-"
													action="right-remove"
												/>
												<Editor2DResizeButton
													cx={editor2DBottomAddX}
													cy={editor2DBottomControlY}
													label="+"
													action="bottom-add"
												/>
												<Editor2DResizeButton
													cx={editor2DBottomRemoveX}
													cy={editor2DBottomControlY}
													label="-"
													action="bottom-remove"
												/>
								</svg>
							</div>
							<If condition={editor2DShowHint}>
								{() => (
									<div class={editor2DHintClass}>
										Drag to pan. Wheel or pinch to zoom. Tap to edit.
									</div>
								)}
							</If>
						</div>
					)}
				</If>
				<If condition={previewMode.eq("3d")}>
					{() => (
						<div class="flex-1 min-h-0 bg-gray-50/50 dark:bg-slate-900/40">
							<RealtimePreview
								mesh={previewMesh}
								loading={previewLoading}
								error={previewError}
								theme={resolvedTheme}
								mobileLayout={isMobileLayout}
							/>
						</div>
					)}
				</If>
				<If condition={isMobileLayout}>
					{() => <PreviewModeSwitcher mobile />}
				</If>
				<If condition={isMobileLayout}>
					{() => <DownloadActions mobile />}
				</If>
			</div>

			{/* Copy Modal */}
			<If condition={showModal}>
				{() => (
					<div class="fixed inset-0 z-[100] flex items-center justify-center p-8">
						<div
							class="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
							on:click={() => (showModal.value = false)}
						></div>
						<div class="bg-white rounded-3xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden relative animate-modal-in dark:bg-slate-950 dark:border dark:border-slate-800">
							<div class="p-6 border-b border-gray-200 flex justify-between items-center dark:border-slate-800">
								<h3 class="text-xl font-bold text-gray-900 dark:text-slate-100">
									Copy SCAD Code
								</h3>
								<button
									class="text-gray-400 hover:text-gray-600 transition dark:text-slate-500 dark:hover:text-slate-300"
									on:click={() => (showModal.value = false)}
								>
									<svg
										class="w-6 h-6"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M6 18L18 6M6 6l12 12"
										></path>
									</svg>
								</button>
							</div>
							<div class="p-6 bg-gray-50 dark:bg-slate-900/60">
								<textarea
									readonly
									class="w-full h-80 border border-gray-200 rounded-xl p-4 font-mono text-[10px] text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition leading-tight resize-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-400/20"
									$ref={(el) => {
										if (el) {
											el.select();
										}
									}}
									value={exportText}
								/>
							</div>
							<div class="p-6 border-t border-gray-200 flex justify-end gap-3 dark:border-slate-800">
								<button
									class={modalActionClass}
									on:click={() => (showModal.value = false)}
								>
									Close
								</button>
								<button
									class={modalPrimaryActionClass}
									on:click={async () => {
										await navigator.clipboard.writeText(exportText.value);
										showModal.value = false;
									}}
								>
									Copy to Clipboard
								</button>
							</div>
						</div>
					</div>
				)}
			</If>

			{/* About Modal */}
			<If condition={showAboutModal}>
				{() => (
					<div class="fixed inset-0 z-[100] flex items-center justify-center p-8">
						<div
							class="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
							on:click={() => (showAboutModal.value = false)}
						></div>
						<div class="bg-white rounded-3xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden relative animate-modal-in dark:bg-slate-950 dark:border dark:border-slate-800">
							<div class="p-6 border-b border-gray-200 flex justify-between items-center dark:border-slate-800">
								<h3 class="text-xl font-bold text-gray-900 dark:text-slate-100">
									About openGrid Studio
								</h3>
								<button
									class="text-gray-400 hover:text-gray-600 transition dark:text-slate-500 dark:hover:text-slate-300"
									on:click={() => (showAboutModal.value = false)}
								>
									<svg
										class="w-6 h-6"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M6 18L18 6M6 6l12 12"
										></path>
									</svg>
								</button>
							</div>
							<div class="p-6 bg-gray-50 grid gap-5 text-sm text-gray-700 dark:bg-slate-900/60 dark:text-slate-300">
								<div class="grid gap-2">
									<div class="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500">
										Project
									</div>
									<p>
										openGrid Studio is a browser-based editor for designing openGrid boards with
										fast 2D editing, realtime 3D preview, and direct export.
									</p>
									<p>
										Repository:{" "}
										<a
											class="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
											href="https://github.com/ClassicOldSong/openGrid-Studio"
											target="_blank"
											rel="noreferrer"
										>
											github.com/ClassicOldSong/openGrid-Studio
										</a>
									</p>
								</div>
								<div class="grid gap-2">
									<div class="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500">
										Credits
									</div>
									<p>
										Original openGrid project: based on the original openGrid design and
										generator.
										{" "}
										<a
											class="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
											href="https://www.opengrid.world/"
											target="_blank"
											rel="noreferrer"
										>
											opengrid.world
										</a>
									</p>
									<p>
										Manifold: powered by the Manifold geometry kernel and the{" "}
										<code>manifold-3d</code> browser bindings used for realtime preview and
										export.
										{" "}
										<a
											class="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
											href="https://github.com/elalish/manifold"
											target="_blank"
											rel="noreferrer"
										>
											github.com/elalish/manifold
										</a>
									</p>
									<p>
										Yukino Song: openGrid Studio by Yukino Song.
										{" "}
										<a
											class="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
											href="https://x.com/ClassicOldSong"
											target="_blank"
											rel="noreferrer"
										>
											x.com/ClassicOldSong
										</a>
									</p>
								</div>
							</div>
							<div class="p-6 border-t border-gray-200 flex justify-end dark:border-slate-800">
								<button
									class={modalPrimaryActionClass}
									on:click={() => (showAboutModal.value = false)}
								>
									Close
								</button>
							</div>
						</div>
					</div>
				)}
			</If>
		</div>
	);
}
