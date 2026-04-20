import { signal, $, watch, onDispose, For, If, read } from 'refui';
import RealtimePreview from './RealtimePreview.jsx'

// --- Constants & Pure Utils ---

const BITS = {
  TILE: 1,
  HOLE: 2,
  CHAMFER: 4,
};

const STORAGE_KEY = 'opengrid-mask-editor-config-v2';
const EXPORT_FORMAT_OPTIONS = [
  { value: 'stl-binary', label: 'STL', extension: 'stl', mimeType: 'model/stl' },
  { value: 'stl-ascii', label: 'ASCII STL', extension: 'stl', mimeType: 'model/stl' },
  { value: '3mf', label: '3MF', extension: '3mf', mimeType: 'model/3mf' },
];
const DEFAULT_CONFIG = {
  themeMode: 'auto',
  fullOrLite: 'Full',
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
  stackingMethod: 'Interface Layer',
  interfaceThicknessValue: 0.4,
  interfaceSeparationValue: 0.1,
  circleSegmentsValue: 64,
  width: 4,
  height: 4,
  top1Text: '0',
  top2Text: '0',
  maskGrid: buildRectangleMask(4, 4),
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function getExportFormatMeta(format) {
  return EXPORT_FORMAT_OPTIONS.find((option) => option.value === format) ?? EXPORT_FORMAT_OPTIONS[0];
}

function shortHash(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0').slice(0, 7);
}

function buildExportFilename(config, format) {
  const meta = getExportFormatMeta(format);
  const boardWidth = Math.max(0, (config.exportGrid?.[0]?.length ?? 1) - 1);
  const boardHeight = Math.max(0, (config.exportGrid?.length ?? 1) - 1);
  const effectiveStackCount = config.addAdhesiveBase ? 1 : Math.max(1, Number(config.stackCountValue) || 1);
  const boardType = String(config.fullOrLite || 'board').trim().toLowerCase();
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
  return Array.from({ length: gh }, () => Array.from({ length: gw }, () => fill));
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
  if (t === '') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function buildTrapezoidMask(width, height, top1Raw, top2Raw) {
  const grid = makeMaskGrid(width, height, 0);
  const top1 = parseTopColumnInput(top1Raw);
  const top2 = parseTopColumnInput(top2Raw);
  const a = top1 <= 0 ? 0 : clamp(top1 - 1, 0, Math.max(0, width - 1));
  const b = top2 <= 0 ? Math.max(0, width - 1) : clamp(top2 - 1, 0, Math.max(0, width - 1));
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
  const nodeKind = Array.from({ length: gh }, () => Array.from({ length: gw }, () => 'none'));
  const nodeDir = Array.from({ length: gh }, () => Array.from({ length: gw }, () => null));

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
        nodeKind[gy][gx] = 'full';
      } else if (count === 1) {
        nodeKind[gy][gx] = 'outer';
        if (se) nodeDir[gy][gx] = 'tl';
        else if (sw) nodeDir[gy][gx] = 'tr';
        else if (ne) nodeDir[gy][gx] = 'bl';
        else if (nw) nodeDir[gy][gx] = 'br';
      } else if (count === 3) {
        nodeKind[gy][gx] = 'inner';
      } else if (count === 2) {
        if (nw && ne) {
          nodeKind[gy][gx] = 'edge';
          nodeDir[gy][gx] = 'up';
        } else if (sw && se) {
          nodeKind[gy][gx] = 'edge';
          nodeDir[gy][gx] = 'down';
        } else if (nw && sw) {
          nodeKind[gy][gx] = 'edge';
          nodeDir[gy][gx] = 'left';
        } else if (ne && se) {
          nodeKind[gy][gx] = 'edge';
          nodeDir[gy][gx] = 'right';
        } else {
          nodeKind[gy][gx] = 'diag';
        }
      } else if (count > 0) {
        nodeKind[gy][gx] = 'used';
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
      if (isNodePos(gx, gy) && topo.nodeKind[gy][gx] === 'outer') {
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
      if (kind === 'none' || kind === 'used') continue;

      if (mode === 'holes_all' && (kind === 'full' || kind === 'inner' || kind === 'diag')) {
        next[gy][gx] ^= BITS.HOLE;
      }
      if (mode === 'connectors_edge' && kind === 'edge') {
        next[gy][gx] ^= BITS.HOLE;
      }
      if (mode === 'chamfer_all') {
        next[gy][gx] ^= BITS.CHAMFER;
      }
      if (mode === 'clear_all') {
        if (!isTilePos(gx, gy)) next[gy][gx] = 0;
      }
    }
  }

  if (mode === 'clear_all') return next;

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      if (isNodePos(gx, gy) && topo.nodeKind[gy][gx] === 'outer') {
        next[gy][gx] |= BITS.CHAMFER;
      }
    }
  }
  return next;
}

function sanitizeMask(grid, width, height) {
  const topo = deriveTopology(grid, width, height);
  const out = Array.from({ length: height + 1 }, () => Array.from({ length: width + 1 }, () => 0));

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

      if ((kind === 'full' || kind === 'inner' || kind === 'diag' || kind === 'edge') && hasHole) out[y][x] |= BITS.HOLE;
      if ((kind === 'full' || kind === 'inner' || kind === 'outer' || kind === 'edge' || kind === 'diag') && hasBit(raw, BITS.CHAMFER)) out[y][x] |= BITS.CHAMFER;
    }
  }

  return out;
}

function toScad2DArray(grid) {
  const rows = grid.map((row) => `  [${row.join(', ')}]`);
  return `[\n${rows.join(',\n')}\n]`;
}

function toScadBool(v) {
  return v ? 'true' : 'false';
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
Usage: Download 'opengrid_generator.scad' from 
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
  if (kind === 'edge') {
    if (hasHole) return 'hole';
    if (hasBit(raw, BITS.CHAMFER)) return 'chamfer';
    return 'none';
  }
  if (kind === 'inner' || kind === 'full' || kind === 'diag') {
    if (hasHole) return 'hole';
    if (hasBit(raw, BITS.CHAMFER)) return 'chamfer';
    return 'none';
  }
  if (kind === 'outer') {
    if (hasBit(raw, BITS.CHAMFER)) return 'chamfer';
    return 'none';
  }
  return 'none';
}

function diamondPoints(x, y, r) {
  return `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`;
}

function squareTile(x, y, size) {
  return { x: x - size / 2, y: y - size / 2, w: size, h: size };
}

function resizeMask(oldGrid, oldW, oldH, nextW, nextH, offsetX = 0, offsetY = 0) {
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

const OuterCornerGlyph = ({ dir, x, y, chamfer }) => {
  const outer = 13;
  const inner = 6.4;

  const isChamfer = $(() => read(chamfer));
  const direction = $(() => read(dir));

  return (
    <g>
      <If condition={$(() => direction.value === 'tl')}>
        {() => (
          <g>
            <polygon attr:points={`${x},${y} ${x + outer},${y} ${x},${y + outer}`} attr:fill="#000" />
            <If condition={isChamfer}>
              {() => <polygon attr:points={`${x},${y} ${x + inner},${y} ${x},${y + inner}`} attr:fill="#fff" />}
            </If>
          </g>
        )}
      </If>
      <If condition={$(() => direction.value === 'tr')}>
        {() => (
          <g>
            <polygon attr:points={`${x},${y} ${x - outer},${y} ${x},${y + outer}`} attr:fill="#000" />
            <If condition={isChamfer}>
              {() => <polygon attr:points={`${x},${y} ${x - inner},${y} ${x},${y + inner}`} attr:fill="#fff" />}
            </If>
          </g>
        )}
      </If>
      <If condition={$(() => direction.value === 'bl')}>
        {() => (
          <g>
            <polygon attr:points={`${x},${y} ${x + outer},${y} ${x},${y - outer}`} attr:fill="#000" />
            <If condition={isChamfer}>
              {() => <polygon attr:points={`${x},${y} ${x + inner},${y} ${x},${y - inner}`} attr:fill="#fff" />}
            </If>
          </g>
        )}
      </If>
      <If condition={$(() => direction.value === 'br')}>
        {() => (
          <g>
            <polygon attr:points={`${x},${y} ${x - outer},${y} ${x},${y - outer}`} attr:fill="#000" />
            <If condition={isChamfer}>
              {() => <polygon attr:points={`${x},${y} ${x - inner},${y} ${x},${y - inner}`} attr:fill="#fff" />}
            </If>
          </g>
        )}
      </If>
    </g>
  );
}

const EdgeGlyph = ({ state, x, y, dir }) => {
  const outer = 13;
  const inner = 6.4;
  const hole = 5.0;

  const direction = $(() => read(dir));
  const currentState = $(() => read(state));

  const points = $(() => {
    const d = direction.value;
    if (d === 'up') return `${x - outer},${y} ${x + outer},${y} ${x},${y - outer}`;
    if (d === 'down') return `${x - outer},${y} ${x + outer},${y} ${x},${y + outer}`;
    if (d === 'left') return `${x},${y - outer} ${x},${y + outer} ${x - outer},${y}`;
    if (d === 'right') return `${x},${y - outer} ${x},${y + outer} ${x + outer},${y}`;
    return '';
  });

  const innerPoints = $(() => {
    const d = direction.value;
    if (d === 'up') return `${x - inner},${y} ${x + inner},${y} ${x},${y - inner}`;
    if (d === 'down') return `${x - inner},${y} ${x + inner},${y} ${x},${y + inner}`;
    if (d === 'left') return `${x},${y - inner} ${x},${y + inner} ${x - inner},${y}`;
    if (d === 'right') return `${x},${y - inner} ${x},${y + inner} ${x + inner},${y}`;
    return '';
  });

  return (
    <g>
      <polygon attr:points={points} attr:fill="#000" />
      <If condition={$(() => currentState.value === 'chamfer')}>
        {() => <polygon attr:points={innerPoints} attr:fill="#fff" />}
      </If>
      <If condition={$(() => currentState.value === 'hole')}>
        {() => <circle attr:cx={x} attr:cy={y} attr:r={hole} attr:fill="#fff" />}
      </If>
    </g>
  )
}

const CenterGlyph = ({ state, x, y }) => {
  const outer = 13;
  const inner = 6.4;
  const hole = 5.0;

  const currentState = $(() => read(state));

  return (
    <g>
      <polygon attr:points={diamondPoints(x, y, outer)} attr:fill="#000" />
      <If condition={$(() => currentState.value === 'chamfer')}>
        {() => <polygon attr:points={diamondPoints(x, y, inner)} attr:fill="#fff" />}
      </If>
      <If condition={$(() => currentState.value === 'hole')}>
        {() => <circle attr:cx={x} attr:cy={y} attr:r={hole} attr:fill="#fff" />}
      </If>
    </g>
  )
}

const NodeGlyph = ({ kind, state, x, y, dir }) => {
  const k = $(() => read(kind));
  return (
    <g>
      <If condition={$(() => k.value === 'outer')}>
        {() => <OuterCornerGlyph dir={dir} x={x} y={y} chamfer={$(() => read(state) === 'chamfer')} />}
      </If>
      <If condition={$(() => k.value === 'edge')}>
        {() => <EdgeGlyph state={state} x={x} y={y} dir={dir} />}
      </If>
      <If condition={$(() => ['inner', 'full', 'diag'].includes(k.value))}>
        {() => <CenterGlyph state={state} x={x} y={y} />}
      </If>
    </g>
  );
}

export default function App() {
  const themeMode = signal(DEFAULT_CONFIG.themeMode);
  const previewMode = signal('2d');
  const exportFormat = signal('stl-binary');
  const systemPrefersDark = signal(false);
  const exportInFlight = signal(false);
  const exportError = signal('');
  const previewMesh = signal(null);
  const previewLoading = signal(false);
  const previewError = signal('');
  const fullOrLite = signal(DEFAULT_CONFIG.fullOrLite);
  const tileSizeValue = signal(DEFAULT_CONFIG.tileSizeValue);
  const tileThicknessValue = signal(DEFAULT_CONFIG.tileThicknessValue);
  const liteTileThicknessValue = signal(DEFAULT_CONFIG.liteTileThicknessValue);
  const heavyTileThicknessValue = signal(DEFAULT_CONFIG.heavyTileThicknessValue);
  const heavyTileGapValue = signal(DEFAULT_CONFIG.heavyTileGapValue);
  const addAdhesiveBase = signal(DEFAULT_CONFIG.addAdhesiveBase);
  const adhesiveBaseThicknessValue = signal(DEFAULT_CONFIG.adhesiveBaseThicknessValue);
  const screwDiameterValue = signal(DEFAULT_CONFIG.screwDiameterValue);
  const screwHeadDiameterValue = signal(DEFAULT_CONFIG.screwHeadDiameterValue);
  const screwHeadInsetValue = signal(DEFAULT_CONFIG.screwHeadInsetValue);
  const screwHeadIsCountersunk = signal(DEFAULT_CONFIG.screwHeadIsCountersunk);
  const screwHeadCountersunkDegreeValue = signal(DEFAULT_CONFIG.screwHeadCountersunkDegreeValue);
  const backsideScrewHole = signal(DEFAULT_CONFIG.backsideScrewHole);
  const backsideScrewHeadDiameterShrinkValue = signal(DEFAULT_CONFIG.backsideScrewHeadDiameterShrinkValue);
  const backsideScrewHeadInsetValue = signal(DEFAULT_CONFIG.backsideScrewHeadInsetValue);
  const backsideScrewHeadIsCountersunk = signal(DEFAULT_CONFIG.backsideScrewHeadIsCountersunk);
  const backsideScrewHeadCountersunkDegreeValue = signal(DEFAULT_CONFIG.backsideScrewHeadCountersunkDegreeValue);
  const stackCountValue = signal(DEFAULT_CONFIG.stackCountValue);
  const stackingMethod = signal(DEFAULT_CONFIG.stackingMethod);
  const interfaceThicknessValue = signal(DEFAULT_CONFIG.interfaceThicknessValue);
  const interfaceSeparationValue = signal(DEFAULT_CONFIG.interfaceSeparationValue);
  const circleSegmentsValue = signal(DEFAULT_CONFIG.circleSegmentsValue);
  const width = signal(DEFAULT_CONFIG.width);
  const height = signal(DEFAULT_CONFIG.height);
  const top1Text = signal(DEFAULT_CONFIG.top1Text);
  const top2Text = signal(DEFAULT_CONFIG.top2Text);
  const maskGrid = signal(cloneGrid(DEFAULT_CONFIG.maskGrid));

  const showModal = signal(false);
  let persistConfig = true;
  const exportWorker = new Worker(new URL('./export-worker.js', import.meta.url), { type: 'module' });
  let workerRequestId = 0;
  const pendingWorkerRequests = new Map();

  exportWorker.postMessage({ type: 'warmup' });

  exportWorker.onmessage = ({ data }) => {
    const pending = pendingWorkerRequests.get(data.id);
    if (!pending) return;
    pendingWorkerRequests.delete(data.id);
    if (data.ok) pending.resolve(data);
    else pending.reject(new Error(data.error));
  };

  exportWorker.onerror = (event) => {
    const error = event.message || 'Export worker failed.';
    for (const pending of pendingWorkerRequests.values()) pending.reject(new Error(error));
    pendingWorkerRequests.clear();
  };

  const applyConfig = (config) => {
    themeMode.value = config.themeMode ?? DEFAULT_CONFIG.themeMode;
    fullOrLite.value = config.fullOrLite ?? DEFAULT_CONFIG.fullOrLite;
    tileSizeValue.value = config.tileSizeValue ?? DEFAULT_CONFIG.tileSizeValue;
    tileThicknessValue.value = config.tileThicknessValue ?? DEFAULT_CONFIG.tileThicknessValue;
    liteTileThicknessValue.value = config.liteTileThicknessValue ?? DEFAULT_CONFIG.liteTileThicknessValue;
    heavyTileThicknessValue.value = config.heavyTileThicknessValue ?? DEFAULT_CONFIG.heavyTileThicknessValue;
    heavyTileGapValue.value = config.heavyTileGapValue ?? DEFAULT_CONFIG.heavyTileGapValue;
    addAdhesiveBase.value = config.addAdhesiveBase ?? DEFAULT_CONFIG.addAdhesiveBase;
    adhesiveBaseThicknessValue.value = config.adhesiveBaseThicknessValue ?? DEFAULT_CONFIG.adhesiveBaseThicknessValue;
    screwDiameterValue.value = config.screwDiameterValue ?? DEFAULT_CONFIG.screwDiameterValue;
    screwHeadDiameterValue.value = config.screwHeadDiameterValue ?? DEFAULT_CONFIG.screwHeadDiameterValue;
    screwHeadInsetValue.value = config.screwHeadInsetValue ?? DEFAULT_CONFIG.screwHeadInsetValue;
    screwHeadIsCountersunk.value = config.screwHeadIsCountersunk ?? DEFAULT_CONFIG.screwHeadIsCountersunk;
    screwHeadCountersunkDegreeValue.value = config.screwHeadCountersunkDegreeValue ?? DEFAULT_CONFIG.screwHeadCountersunkDegreeValue;
    backsideScrewHole.value = config.backsideScrewHole ?? DEFAULT_CONFIG.backsideScrewHole;
    backsideScrewHeadDiameterShrinkValue.value = config.backsideScrewHeadDiameterShrinkValue ?? DEFAULT_CONFIG.backsideScrewHeadDiameterShrinkValue;
    backsideScrewHeadInsetValue.value = config.backsideScrewHeadInsetValue ?? DEFAULT_CONFIG.backsideScrewHeadInsetValue;
    backsideScrewHeadIsCountersunk.value = config.backsideScrewHeadIsCountersunk ?? DEFAULT_CONFIG.backsideScrewHeadIsCountersunk;
    backsideScrewHeadCountersunkDegreeValue.value = config.backsideScrewHeadCountersunkDegreeValue ?? DEFAULT_CONFIG.backsideScrewHeadCountersunkDegreeValue;
    stackCountValue.value = config.stackCountValue ?? DEFAULT_CONFIG.stackCountValue;
    stackingMethod.value = config.stackingMethod ?? DEFAULT_CONFIG.stackingMethod;
    interfaceThicknessValue.value = config.interfaceThicknessValue ?? DEFAULT_CONFIG.interfaceThicknessValue;
    interfaceSeparationValue.value = config.interfaceSeparationValue ?? DEFAULT_CONFIG.interfaceSeparationValue;
    circleSegmentsValue.value = config.circleSegmentsValue ?? DEFAULT_CONFIG.circleSegmentsValue;
    width.value = config.width ?? DEFAULT_CONFIG.width;
    height.value = config.height ?? DEFAULT_CONFIG.height;
    top1Text.value = config.top1Text ?? DEFAULT_CONFIG.top1Text;
    top2Text.value = config.top2Text ?? DEFAULT_CONFIG.top2Text;
    maskGrid.value = cloneGrid(config.maskGrid ?? DEFAULT_CONFIG.maskGrid);
  };

  const getConfigState = () => ({
    themeMode: themeMode.value,
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
    backsideScrewHeadDiameterShrinkValue: backsideScrewHeadDiameterShrinkValue.value,
    backsideScrewHeadInsetValue: backsideScrewHeadInsetValue.value,
    backsideScrewHeadIsCountersunk: backsideScrewHeadIsCountersunk.value,
    backsideScrewHeadCountersunkDegreeValue: backsideScrewHeadCountersunkDegreeValue.value,
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

  if (typeof window !== 'undefined' && window.matchMedia) {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    systemPrefersDark.value = media.matches;
    const onChange = (event) => {
      systemPrefersDark.value = event.matches;
    };
    if (media.addEventListener) media.addEventListener('change', onChange);
    else media.addListener(onChange);
    onDispose(() => {
      if (media.removeEventListener) media.removeEventListener('change', onChange);
      else media.removeListener(onChange);
    });
  }

  onDispose(() => {
    for (const pending of pendingWorkerRequests.values()) pending.reject(new Error('Worker task was interrupted.'));
    pendingWorkerRequests.clear();
    exportWorker.terminate();
  });

  // Load from local storage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved) applyConfig({
        ...DEFAULT_CONFIG,
        ...saved,
        themeMode: saved.themeMode ?? (saved.theme === 'light' || saved.theme === 'dark' ? saved.theme : DEFAULT_CONFIG.themeMode),
      });
    }
  } catch (e) { }

  // Save to local storage
  watch(() => {
    if (!persistConfig) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getConfigState()));
  });

  const resolvedTheme = $(() => {
    if (themeMode.value === 'auto') return systemPrefersDark.value ? 'dark' : 'light';
    return themeMode.value;
  });

  watch(() => {
    if (typeof document !== 'undefined') {
      const isDark = resolvedTheme.value === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.style.colorScheme = resolvedTheme.value;
    }
  });

  const topo = $(() => deriveTopology(maskGrid.value, width.value, height.value));
  const exportGrid = $(() => sanitizeMask(maskGrid.value, width.value, height.value));
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
    backsideScrewHeadDiameterShrinkValue: backsideScrewHeadDiameterShrinkValue.value,
    backsideScrewHeadInsetValue: backsideScrewHeadInsetValue.value,
    backsideScrewHeadIsCountersunk: backsideScrewHeadIsCountersunk.value,
    backsideScrewHeadCountersunkDegreeValue: backsideScrewHeadCountersunkDegreeValue.value,
    stackCountValue: stackCountValue.value,
    stackingMethod: stackingMethod.value,
    interfaceThicknessValue: interfaceThicknessValue.value,
    interfaceSeparationValue: interfaceSeparationValue.value,
    circleSegmentsValue: circleSegmentsValue.value,
  }));
  const previewConfigJson = $(() => JSON.stringify(exportConfig.value));
  const exportText = $(() => buildEntryScad(exportConfig.value));

  const updateSize = (nextW, nextH, offsetX = 0, offsetY = 0) => {
    const nw = Math.max(1, nextW);
    const nh = Math.max(1, nextH);
    if (nw !== width.value || nh !== height.value || offsetX !== 0 || offsetY !== 0) {
      maskGrid.value = resizeMask(maskGrid.value, width.value, height.value, nw, nh, offsetX, offsetY);
      width.value = nw;
      height.value = nh;
    }
  };

  // const applyRectangle = () => {
  //   maskGrid.value = buildRectangleMask(width.value, height.value);
  //   top1Text.value = '0';
  //   top2Text.value = '0';
  // };

  const applyTrapezoid = () => {
    maskGrid.value = buildTrapezoidMask(width.value, height.value, top1Text.value, top2Text.value);
  };

  const applyHelper = (helperMode) => {
    maskGrid.value = applyPreset(maskGrid.value, width.value, height.value, helperMode);
  };

  const toggleTile = (gx, gy) => {
    const next = cloneGrid(maskGrid.value);
    next[gy][gx] ^= BITS.TILE;
    maskGrid.value = next;
  };

  const cycleNode = (gx, gy) => {
    const kind = topo.value.nodeKind[gy][gx];
    if (kind === 'none' || kind === 'used') return;
    const next = cloneGrid(maskGrid.value);
    const raw = getMask(maskGrid.value, gx, gy);
    const current = nodeState(kind, raw);
    next[gy][gx] &= ~(BITS.HOLE | BITS.CHAMFER);

    if (kind === 'outer') {
      if (current === 'none') next[gy][gx] |= BITS.CHAMFER;
    } else {
      if (current === 'none') next[gy][gx] |= BITS.CHAMFER;
      else if (current === 'chamfer') next[gy][gx] |= BITS.HOLE;
    }
    maskGrid.value = next;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportText.value);
      showModal.value = true;
    } catch { }
  };

  const requestWorker = (type, payload = {}) => new Promise((resolve, reject) => {
    const id = ++workerRequestId;
    pendingWorkerRequests.set(id, { resolve, reject });
    exportWorker.postMessage({ id, type, ...payload });
  });

  const renderExport = (config, format) => requestWorker('render-export', { config, format });
  const renderPreviewMesh = (config) => requestWorker('preview-mesh', { config });

  const downloadExport = async () => {
    if (exportInFlight.value) return;
    exportInFlight.value = true;
    exportError.value = '';
    let objectUrl = null;

    try {
      const config = exportConfig.value;
      const format = exportFormat.value;
      const filename = buildExportFilename(config, format);
      const { bytes, mimeType, logs } = await renderExport(config, format);
      const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
      objectUrl = URL.createObjectURL(blob);
      const element = document.createElement('a');
      element.href = objectUrl;
      element.download = filename;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      if (logs?.length) console.info('Export:', logs.join('\n'));
    } catch (error) {
      exportError.value = error instanceof Error ? error.message : 'Export failed.';
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      exportInFlight.value = false;
    }
  };

  const chooseExportFormat = (format, event) => {
    exportFormat.value = format;
    event?.currentTarget?.closest('details')?.removeAttribute('open');
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

  const svgW = $(() => width.value * tileSize + pad * 2);
  const svgH = $(() => height.value * tileSize + pad * 2);
  const boardW = $(() => width.value * tileSize);
  const boardH = $(() => height.value * tileSize);

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
          if (kind !== 'none' && kind !== 'used') {
            items.push({ id: `${gx}-${gy}`, gx, gy });
          }
        }
      }
    }
    return items;
  });

  const inputClass = 'border border-gray-200 rounded-lg h-9 px-3 text-sm text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-400/20';
  const compactInputClass = 'border border-gray-200 rounded-lg h-8 px-2 text-xs text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-400/20';
  const sectionClass = 'grid gap-4 border-t border-gray-200 pt-6 dark:border-slate-800';
  const sectionTitleClass = 'text-[10px] font-bold uppercase tracking-widest text-blue-600/70 dark:text-blue-300/80';
  const fieldLabelClass = 'text-[10px] font-bold text-gray-400 uppercase tracking-tighter dark:text-slate-500';
  const formLabelClass = 'text-xs font-medium text-gray-500 dark:text-slate-400';
  const toggleLabelClass = 'flex items-center gap-2 text-sm font-medium text-gray-600 cursor-pointer dark:text-slate-300';
  const chipButtonClass = 'bg-gray-100 text-gray-600 rounded-lg py-1.5 px-3 text-[10px] font-bold uppercase hover:bg-gray-200 transition tracking-tight dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';
  const iconButtonClass = 'w-6 h-6 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded text-gray-700 font-bold text-xs transition dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';
  const secondaryButtonClass = 'bg-white border border-gray-200 text-gray-700 rounded-xl h-10 px-6 text-sm font-bold hover:border-gray-300 transition flex items-center gap-2 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:hover:border-slate-600';
  const primaryButtonClass = 'bg-blue-600 text-white rounded-xl h-10 px-4 text-sm font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-lg shadow-blue-600/20 dark:bg-blue-500 dark:hover:bg-blue-400';
  const modalActionClass = 'bg-gray-100 text-gray-700 rounded-xl px-6 h-11 font-bold hover:bg-gray-200 transition dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';
  const modalPrimaryActionClass = 'bg-blue-600 text-white rounded-xl px-8 h-11 font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20 dark:bg-blue-500 dark:hover:bg-blue-400';
  const themeBarClass = 'inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 h-10 dark:border-slate-700 dark:bg-slate-900';
  const themeOptionClass = (mode) => $(() => {
    const active = themeMode.value === mode;
    return [
      'rounded-lg px-3 h-7.5 text-xs font-bold uppercase tracking-wider transition',
      active
        ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
        : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200',
    ].join(' ');
  });
  const previewBarClass = 'inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 h-10 dark:border-slate-700 dark:bg-slate-900';
  const previewOptionClass = (mode) => $(() => {
    const active = previewMode.value === mode;
    return [
      'rounded-lg px-3 h-7.5 text-xs font-bold uppercase tracking-wider transition',
      active
        ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
        : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200',
    ].join(' ');
  });
  const exportFormatLabel = $(() => getExportFormatMeta(exportFormat.value).label);
  const exportButtonClass = $(() => [
    primaryButtonClass,
    'rounded-r-none',
    exportInFlight.value ? 'cursor-wait opacity-70' : '',
  ].join(' '));
  const exportDropdownButtonClass = $(() => [
    'flex items-center justify-center bg-blue-600 text-white rounded-r-xl rounded-l-none h-10 px-2 leading-none hover:bg-blue-700 transition border-l border-blue-500/70 shadow-lg shadow-blue-600/20 dark:bg-blue-500 dark:hover:bg-blue-400 dark:border-blue-400/40',
    exportInFlight.value ? 'cursor-wait opacity-70 pointer-events-none' : '',
  ].join(' '));
  const exportMenuClass = 'absolute right-0 top-full z-30 mt-2 min-w-40 rounded-xl border border-gray-200 bg-white p-1 shadow-[0_12px_30px_rgba(15,23,42,0.14)] dark:border-slate-700 dark:bg-slate-900';
  const exportMenuItemClass = (format) => $(() => [
    'flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold transition',
    exportFormat.value === format
      ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200'
      : 'text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800',
  ].join(' '));

  let previewTimer = null;
  let previewSequence = 0;

  const cancelPreviewRender = (clearMesh = false) => {
    if (previewTimer) {
      clearTimeout(previewTimer);
      previewTimer = null;
    }
    previewSequence += 1;
    previewLoading.value = false;
    previewError.value = '';
    if (clearMesh) previewMesh.value = null;
  };

  const queuePreviewRender = (config) => {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      const sequence = ++previewSequence;
      previewLoading.value = true;
      previewError.value = '';

      try {
        const { mesh } = await renderPreviewMesh(config);
        if (sequence !== previewSequence) return;
        previewMesh.value = mesh;
        previewLoading.value = false;
      } catch (error) {
        if (sequence !== previewSequence) return;
        previewError.value = error instanceof Error ? error.message : 'Preview generation failed.';
        previewLoading.value = false;
      }
    }, 120);
  };

  watch(() => {
    const previewConfig = JSON.parse(previewConfigJson.value);
    if (previewMode.value !== '3d') {
      cancelPreviewRender(false);
      return;
    }
    queuePreviewRender(previewConfig);
  });

  onDispose(() => {
    cancelPreviewRender(false);
  });

  const ResizeButtons = ({ onPlus, onMinus, vertical }) => (
    <div class={vertical ? "flex flex-col gap-1 items-center" : "flex flex-row gap-1 items-center"}>
      <button class={iconButtonClass} on:click={onPlus}>+</button>
      <button class={iconButtonClass} on:click={onMinus}>-</button>
    </div>
  );

  return (
    <div class="h-screen flex overflow-hidden font-sans bg-white text-gray-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Left: Config */}
      <div class="w-[400px] min-w-[400px] shrink-0 h-full overflow-auto bg-gray-50 border-r border-gray-200 flex flex-col z-10 dark:bg-slate-950 dark:border-slate-800">
        <div class="p-8 flex flex-col gap-8">
          <div>
            <h2 class="text-xl font-bold text-gray-900 dark:text-slate-100 mb-6 flex items-center gap-2">
              <div class="w-2 h-6 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
              Configuration
            </h2>
            
            <div class="grid gap-6">
              <div class="grid gap-4">
                <div class={sectionTitleClass}>Shape Helpers</div>
                <div class="grid grid-cols-2 gap-3">
                  <div class="grid gap-1">
                    <label class={formLabelClass}>Width</label>
                    <input type="number" class={inputClass} min={1} value={width} on:input={(e) => updateSize(Math.max(1, Number(e.target.value) || 1), height.value)} />
                  </div>
                  <div class="grid gap-1">
                    <label class={formLabelClass}>Height</label>
                    <input type="number" class={inputClass} min={1} value={height} on:input={(e) => updateSize(width.value, Math.max(1, Number(e.target.value) || 1))} />
                  </div>
                  {/*<button class="bg-blue-600 text-white rounded-lg h-9 px-4 text-sm font-semibold hover:bg-blue-700 transition" on:click={applyRectangle}>Rectangle</button>*/}
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div class="grid gap-1">
                    <label class={formLabelClass}>Top col 1</label>
                    <input type="number" class={inputClass} value={top1Text} on:input={(e) => top1Text.value = e.target.value} />
                  </div>
                  <div class="grid gap-1">
                    <label class={formLabelClass}>Top col 2</label>
                    <input type="number" class={inputClass} value={top2Text} on:input={(e) => top2Text.value = e.target.value} />
                  </div>
                  <button class="bg-blue-600 border border-blue-600 text-white rounded-lg h-9 px-4 text-sm font-semibold hover:bg-blue-700 transition col-span-2 dark:bg-blue-500 dark:border-blue-500 dark:hover:bg-blue-400" on:click={applyTrapezoid}>Apply</button>
                </div>
              </div>

              <div class={sectionClass}>
                <div class={sectionTitleClass}>Presets</div>
                <div class="flex flex-wrap gap-2">
                  {[
                    { label: 'Screws', mode: 'holes_all' },
                    { label: 'Connectors', mode: 'connectors_edge' },
                    { label: 'Chamfers', mode: 'chamfer_all' },
                    { label: 'Clear', mode: 'clear_all' },
                  ].map(({ label, mode }) => (
                    <button class={chipButtonClass} on:click={() => applyHelper(mode)}>{label}</button>
                  ))}
                </div>
              </div>

              <div class={sectionClass}>
                <div class={sectionTitleClass}>Board Type</div>
                <div class="flex gap-4">
                  {['Full', 'Lite', 'Heavy'].map((v) => (
                    <label class="flex items-center gap-2 cursor-pointer group">
                      <input type="radio" class="w-4 h-4 text-blue-600 focus:ring-blue-500/20 border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:focus:ring-blue-400/20" checked={fullOrLite.eq(v)} on:change={() => fullOrLite.value = v} />
                      <span class="text-sm font-medium text-gray-600 group-hover:text-blue-600 transition dark:text-slate-300 dark:group-hover:text-blue-300">{v}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div class={sectionClass}>
                <div class={sectionTitleClass}>Stacking</div>
                <div class="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div class="grid gap-1">
                    <label class={fieldLabelClass}>Stack Count</label>
                    <input type="number" class={compactInputClass} value={stackCountValue} on:input={(e) => stackCountValue.value = Number(e.target.value) || 0} />
                  </div>
                  <div class="grid gap-1">
                    <label class={fieldLabelClass}>Method</label>
                    <select class={compactInputClass} value={stackingMethod} on:change={(e) => stackingMethod.value = e.target.value}>
                      <option>Interface Layer</option>
                      <option>Ironing - BETA</option>
                    </select>
                  </div>
                  <div class="grid gap-1">
                    <label class={fieldLabelClass}>Interface Thickness</label>
                    <input type="number" class={compactInputClass} step={0.1} value={interfaceThicknessValue} on:input={(e) => interfaceThicknessValue.value = Number(e.target.value) || 0} />
                  </div>
                  <div class="grid gap-1">
                    <label class={fieldLabelClass}>Separation</label>
                    <input type="number" class={compactInputClass} step={0.1} value={interfaceSeparationValue} on:input={(e) => interfaceSeparationValue.value = Number(e.target.value) || 0} />
                  </div>
                </div>
              </div>

              <div class={sectionClass}>
                <div class={sectionTitleClass}>Screws</div>
                <div class="grid grid-cols-2 gap-x-4 gap-y-3">
                  {[
                    { label: 'Screw Diameter', step: 0.1, sig: screwDiameterValue },
                    { label: 'Head Diameter', step: 0.1, sig: screwHeadDiameterValue },
                    { label: 'Head Inset', step: 0.1, sig: screwHeadInsetValue },
                    { label: 'Sink Deg', step: 0.1, sig: screwHeadCountersunkDegreeValue },
                  ].map(({ label, sig, step }) => (
                    <div class="grid gap-1">
                      <label class={fieldLabelClass}>{label}</label>
                      <input type="number" class={compactInputClass} step={step} value={sig} on:input={(e) => sig.value = Number(e.target.value) || 0} />
                    </div>
                  ))}
                </div>
                <label class={toggleLabelClass}>
                  <input type="checkbox" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:focus:ring-blue-400/20" checked={screwHeadIsCountersunk} on:change={(e) => screwHeadIsCountersunk.value = e.target.checked} />
                  Countersunk
                </label>
              </div>

              <If condition={fullOrLite.eq('Full')}>{() => (
                <div class={sectionClass}>
                  <div class={sectionTitleClass}>Backside Screws</div>
                  <label class={toggleLabelClass}>
                    <input type="checkbox" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:focus:ring-blue-400/20" checked={backsideScrewHole} on:change={(e) => backsideScrewHole.value = e.target.checked} />
                    Enable backside
                  </label>
                  <div class="grid grid-cols-2 gap-x-4 gap-y-3">
                    {[
                      { label: 'Head Shrink', step: 0.1, sig: backsideScrewHeadDiameterShrinkValue },
                      { label: 'Head Inset', step: 0.1, sig: backsideScrewHeadInsetValue },
                    ].map(({ label, sig, step }) => (
                      <div class="grid gap-1">
                        <label class={fieldLabelClass}>{label}</label>
                        <input type="number" class={compactInputClass} step={step} value={sig} on:input={(e) => sig.value = Number(e.target.value) || 0} />
                      </div>
                    ))}
                  </div>
                  <label class={toggleLabelClass}>
                    <input type="checkbox" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:focus:ring-blue-400/20" checked={backsideScrewHeadIsCountersunk} on:change={(e) => backsideScrewHeadIsCountersunk.value = e.target.checked} />
                    Backside countersunk
                  </label>
                </div>
              )}</If>

              <If condition={fullOrLite.eq('Lite')}>{() => (
                <div class={sectionClass}>
                  <div class={sectionTitleClass}>Adhesive Base</div>
                  <label class={toggleLabelClass}>
                    <input type="checkbox" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:focus:ring-blue-400/20" checked={addAdhesiveBase} on:change={(e) => addAdhesiveBase.value = e.target.checked} />
                    Enable base
                  </label>
                  <div class="grid gap-1">
                    <label class={fieldLabelClass}>Thickness</label>
                    <input type="number" class={compactInputClass} value={adhesiveBaseThicknessValue} on:input={(e) => adhesiveBaseThicknessValue.value = Number(e.target.value) || 0} />
                  </div>
                </div>
              )}</If>

              <div class={sectionClass}>
                <div class={sectionTitleClass}>Dimensions</div>
                <div class="grid grid-cols-2 gap-x-4 gap-y-3">
                  {[
                    { label: 'Tile Size', step: 1, sig: tileSizeValue },
                    { label: 'Thickness', type: 'Full', step: 0.1, sig: tileThicknessValue },
                    { label: 'Lite Thickness', type: 'Lite', step: 0.1, sig: liteTileThicknessValue },
                    { label: 'Heavy Thickness', type: 'Heavy', step: 0.1, sig: heavyTileThicknessValue },
                    { label: 'Heavy Gap', type: 'Heavy', step: 0.1, sig: heavyTileGapValue }
                  ].map(({ label, type, sig, step }) => (
                    <If condition={() => type ? fullOrLite.value === type : true}>{() => (
                      <div class="grid gap-1">
                        <label class={fieldLabelClass}>{label}</label>
                        <input type="number" class={compactInputClass} step={step} value={sig} on:input={(e) => sig.value = Number(e.target.value) || 0} />
                      </div>
                    )}</If>
                  ))}
                </div>
              </div>

              <div class={sectionClass}>
                <div class={sectionTitleClass}>Quality</div>
                <div class="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div class="grid gap-1">
                    <label class={fieldLabelClass}>Segments</label>
                    <input type="number" class={compactInputClass} value={circleSegmentsValue} on:input={(e) => circleSegmentsValue.value = Number(e.target.value) || 0} />
                  </div>
                </div>
              </div>

              <div class="grid gap-3 border-t border-gray-200 pt-4 dark:border-slate-800">
                <button class={chipButtonClass} on:click={clearConfiguration}>Clear Saved Config</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Preview Area */}
      <div class="flex-1 min-w-0 flex flex-col h-full bg-white relative dark:bg-slate-950">
        {/* Title Bar */}
        <div class="h-16 border-b border-gray-200 flex items-center justify-between px-8 bg-white z-20 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div class="flex items-center gap-4">
            <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-500/30 dark:bg-blue-500 dark:shadow-blue-500/20">G</div>
            <h1 class="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-slate-400">openGrid Studio</h1>
            <div class={previewBarClass}>
              <button class={previewOptionClass('2d')} on:click={() => previewMode.value = '2d'}>2D</button>
              <button class={previewOptionClass('3d')} on:click={() => previewMode.value = '3d'}>3D</button>
            </div>
          </div>
          <div class="flex gap-2 items-center">
            <div class={themeBarClass}>
              <button class={themeOptionClass('auto')} on:click={() => themeMode.value = 'auto'}>Auto</button>
              <button class={themeOptionClass('light')} on:click={() => themeMode.value = 'light'}>Light</button>
              <button class={themeOptionClass('dark')} on:click={() => themeMode.value = 'dark'}>Dark</button>
            </div>
            <button class={secondaryButtonClass} on:click={copy}>
              Copy SCAD
            </button>
            <div class="relative flex items-stretch">
              <button class={exportButtonClass} on:click={downloadExport} prop:disabled={exportInFlight}>
                {$(() => exportInFlight.value ? `Rendering ${exportFormatLabel.value}...` : `Download ${exportFormatLabel.value}`)}
              </button>
              <details class="relative">
                <summary class={exportDropdownButtonClass} style="list-style: none;">
                  <svg aria-hidden="true" viewBox="0 0 16 16" class="h-4 w-4 fill-current">
                    <path d="M4.22 6.97a.75.75 0 0 1 1.06 0L8 9.69l2.72-2.72a.75.75 0 1 1 1.06 1.06L8.53 11.28a.75.75 0 0 1-1.06 0L4.22 8.03a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                </summary>
                <div class={exportMenuClass}>
                  {EXPORT_FORMAT_OPTIONS.map((option) => (
                    <button class={exportMenuItemClass(option.value)} on:click={(event) => chooseExportFormat(option.value, event)}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </details>
            </div>
          </div>
        </div>
        <If condition={exportError}>
          {() => (
            <div class="px-8 py-3 border-b border-rose-200 bg-rose-50 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
              {exportError}
            </div>
          )}
        </If>

        {/* Editor Surface */}
        <If condition={previewMode.eq('2d')}>
          {() => (
            <div class="flex-1 overflow-x-auto overflow-y-auto p-12 flex bg-gray-50/50 relative scrollbar-hide dark:bg-slate-900/40">
              <div class="flex min-w-max min-h-full flex-col items-center justify-center gap-8 m-auto">
                <div class="flex min-w-max min-h-full flex-col items-center justify-center gap-6">
                  <ResizeButtons onPlus={() => updateSize(width.value, height.value + 1, 0, 1)} onMinus={() => updateSize(width.value, height.value - 1, 0, -1)} />
                  <div class="flex items-center gap-6">
                    <ResizeButtons vertical onPlus={() => updateSize(width.value + 1, height.value, 1, 0)} onMinus={() => updateSize(width.value - 1, height.value, -1, 0)} />
                    <div class="bg-white rounded-2xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-gray-100 flex items-center justify-center dark:bg-slate-900 dark:border-slate-700 dark:shadow-[0_24px_80px_rgba(2,6,23,0.55)]">
                      <svg attr:width={svgW} attr:height={svgH} class="rounded-lg border border-gray-100 bg-white dark:border-slate-700">
                        <rect attr:x={pad} attr:y={pad} attr:width={boardW} attr:height={boardH} attr:fill="#000" />

                        <For entries={tiles} track="id">
                          {({ item: { tx, ty, gx, gy } }) => {
                            const active = $(() => tileFill(read(getMask(maskGrid.value, gx, gy))));
                            return (
                              <If condition={$(() => !active.value)}>
                                {() => (
                                  <rect
                                    attr:x={pad + tx * tileSize} attr:y={pad + ty * tileSize}
                                    attr:width={tileSize} attr:height={tileSize}
                                    attr:fill="#fff"
                                  />
                                )}
                              </If>
                            );
                          }}
                        </For>

                        <For entries={tiles} track="id">
                          {({ item: { tx, ty, gx, gy } }) => {
                            const active = $(() => tileFill(read(getMask(maskGrid.value, gx, gy))));
                            const x = pad + tx * tileSize + half;
                            const y = pad + ty * tileSize + half;
                            const sq = squareTile(x, y, tileSize);
                            const border = 3;

                            return (
                              <If condition={active}>
                                {() => (
                                  <g>
                                    <rect attr:x={sq.x} attr:y={sq.y} attr:width={sq.w} attr:height={sq.h} attr:fill="#000" />
                                    <rect attr:x={sq.x + border} attr:y={sq.y + border} attr:width={sq.w - border * 2} attr:height={sq.h - border * 2} attr:fill="#2563eb" />
                                  </g>
                                )}
                              </If>
                            );
                          }}
                        </For>

                        <For entries={nodes} track="id">
                          {({ item: { gx, gy } }) => {
                            const { x, y } = toNodeXY(gx, gy);
                            const kind = $(() => topo.value.nodeKind[gy]?.[gx] ?? 'none');
                            const dir = $(() => topo.value.nodeDir[gy]?.[gx] ?? null);
                            const state = $(() => nodeState(kind.value, getMask(maskGrid.value, gx, gy)));
                            return (
                              <g>
                                <NodeGlyph kind={kind} state={state} x={x} y={y} dir={dir} />
                              </g>
                            );
                          }}
                        </For>

                        <For entries={tiles} track="id">
                          {({ item: { tx, ty, gx, gy } }) => (
                            <rect
                              attr:x={pad + tx * tileSize} attr:y={pad + ty * tileSize}
                              attr:width={tileSize} attr:height={tileSize}
                              attr:fill="transparent" on:click={() => toggleTile(gx, gy)} style="cursor: pointer"
                            />
                          )}
                        </For>

                        <For entries={nodes} track="id">
                          {({ item: { gx, gy } }) => {
                            const { x, y } = toNodeXY(gx, gy);
                            return (
                              <circle attr:cx={x} attr:cy={y} attr:r={20} attr:fill="transparent" on:click={() => cycleNode(gx, gy)} style="cursor: pointer" />
                            );
                          }}
                        </For>
                      </svg>
                    </div>
                    <ResizeButtons vertical onPlus={() => updateSize(width.value + 1, height.value)} onMinus={() => updateSize(width.value - 1, height.value)} />
                  </div>
                  <ResizeButtons onPlus={() => updateSize(width.value, height.value + 1)} onMinus={() => updateSize(width.value, height.value - 1)} />
                </div>
              </div>
            </div>
          )}
        </If>
        <If condition={previewMode.eq('3d')}>
          {() => (
            <div class="flex-1 min-h-0 bg-gray-50/50 dark:bg-slate-900/40">
              <RealtimePreview
                mesh={previewMesh}
                loading={previewLoading}
                error={previewError}
                theme={resolvedTheme}
              />
            </div>
          )}
        </If>
      </div>

      {/* Copy Modal */}
      <If condition={showModal}>
        {() => (
          <div class="fixed inset-0 z-[100] flex items-center justify-center p-8">
            <div class="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" on:click={() => showModal.value = false}></div>
            <div class="bg-white rounded-3xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden relative animate-modal-in dark:bg-slate-950 dark:border dark:border-slate-800">
              <div class="p-6 border-b border-gray-200 flex justify-between items-center dark:border-slate-800">
                <h3 class="text-xl font-bold text-gray-900 dark:text-slate-100">Copy SCAD Code</h3>
                <button class="text-gray-400 hover:text-gray-600 transition dark:text-slate-500 dark:hover:text-slate-300" on:click={() => showModal.value = false}>
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
              <div class="p-6 bg-gray-50 dark:bg-slate-900/60">
                <textarea 
                  readonly 
                  class="w-full h-80 border border-gray-200 rounded-xl p-4 font-mono text-[10px] text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition leading-tight resize-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-400/20" 
                  $ref={(el) => { if (el) { el.select(); } }}
                  value={exportText} 
                />
              </div>
              <div class="p-6 border-t border-gray-200 flex justify-end gap-3 dark:border-slate-800">
                <button class={modalActionClass} on:click={() => showModal.value = false}>Close</button>
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
    </div>
  );
}
