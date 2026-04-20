import { signal, $, watch, onDispose, For, If, read } from 'refui';

// --- Constants & Pure Utils ---

const BITS = {
  TILE: 1,
  HOLE: 2,
  CHAMFER: 4,
};

const STORAGE_KEY = 'opengrid-mask-editor-config-v2';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
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

  return `include <BOSL2/std.scad>\nuse <opengrid_generator.scad>\n\nmask = ${toScad2DArray(exportGrid)};\n\nopenGridFromMask(\n  mask_array = mask,\n  full_or_lite = \"${fullOrLite}\",\n  tile_size = ${tileSizeValue},\n  tile_thickness = ${tileThicknessValue},\n  lite_tile_thickness = ${liteTileThicknessValue},\n  heavy_tile_thickness = ${heavyTileThicknessValue},\n  heavy_tile_gap = ${heavyTileGapValue},\n  add_adhesive_base = ${toScadBool(addAdhesiveBase)},\n  adhesive_base_thickness = ${adhesiveBaseThicknessValue},\n  screw_diameter = ${screwDiameterValue},\n  screw_head_diameter = ${screwHeadDiameterValue},\n  screw_head_inset = ${screwHeadInsetValue},\n  screw_head_is_countersunk = ${toScadBool(screwHeadIsCountersunk)},\n  screw_head_countersunk_degree = ${screwHeadCountersunkDegreeValue},\n  backside_screw_hole = ${toScadBool(backsideScrewHole)},\n  backside_screw_head_diameter_shrink = ${backsideScrewHeadDiameterShrinkValue},\n  backside_screw_head_inset = ${backsideScrewHeadInsetValue},\n  backside_screw_head_is_countersunk = ${toScadBool(backsideScrewHeadIsCountersunk)},\n  backside_screw_head_countersunk_degree = ${backsideScrewHeadCountersunkDegreeValue},\n  stack_count = ${stackCountValue},\n  stacking_method = \"${stackingMethod}\",\n  interface_thickness = ${interfaceThicknessValue},\n  interface_separation = ${interfaceSeparationValue},\n  circle_segments = ${circleSegmentsValue},\n  anchor = BOT,\n  spin = 0,\n  orient = UP\n);`;
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
  const fullOrLite = signal('Full');
  const tileSizeValue = signal(28);
  const tileThicknessValue = signal(6.8);
  const liteTileThicknessValue = signal(4);
  const heavyTileThicknessValue = signal(13.8);
  const heavyTileGapValue = signal(0.2);
  const addAdhesiveBase = signal(false);
  const adhesiveBaseThicknessValue = signal(0.6);
  const screwDiameterValue = signal(4.1);
  const screwHeadDiameterValue = signal(7.2);
  const screwHeadInsetValue = signal(1);
  const screwHeadIsCountersunk = signal(true);
  const screwHeadCountersunkDegreeValue = signal(90);
  const backsideScrewHole = signal(true);
  const backsideScrewHeadDiameterShrinkValue = signal(0);
  const backsideScrewHeadInsetValue = signal(1);
  const backsideScrewHeadIsCountersunk = signal(true);
  const backsideScrewHeadCountersunkDegreeValue = signal(90);
  const stackCountValue = signal(1);
  const stackingMethod = signal('Interface Layer');
  const interfaceThicknessValue = signal(0.4);
  const interfaceSeparationValue = signal(0.1);
  const circleSegmentsValue = signal(64);
  const width = signal(4);
  const height = signal(4);
  const top1Text = signal('0');
  const top2Text = signal('0');
  const maskGrid = signal(buildRectangleMask(4, 4));

  const showModal = signal(false);

  // Load from local storage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved) {
        if (saved.fullOrLite) fullOrLite.value = saved.fullOrLite;
        if (saved.tileSizeValue !== undefined) tileSizeValue.value = saved.tileSizeValue;
        if (saved.tileThicknessValue !== undefined) tileThicknessValue.value = saved.tileThicknessValue;
        if (saved.liteTileThicknessValue !== undefined) liteTileThicknessValue.value = saved.liteTileThicknessValue;
        if (saved.heavyTileThicknessValue !== undefined) heavyTileThicknessValue.value = saved.heavyTileThicknessValue;
        if (saved.heavyTileGapValue !== undefined) heavyTileGapValue.value = saved.heavyTileGapValue;
        if (saved.addAdhesiveBase !== undefined) addAdhesiveBase.value = saved.addAdhesiveBase;
        if (saved.adhesiveBaseThicknessValue !== undefined) adhesiveBaseThicknessValue.value = saved.adhesiveBaseThicknessValue;
        if (saved.screwDiameterValue !== undefined) screwDiameterValue.value = saved.screwDiameterValue;
        if (saved.screwHeadDiameterValue !== undefined) screwHeadDiameterValue.value = saved.screwHeadDiameterValue;
        if (saved.screwHeadInsetValue !== undefined) screwHeadInsetValue.value = saved.screwHeadInsetValue;
        if (saved.screwHeadIsCountersunk !== undefined) screwHeadIsCountersunk.value = saved.screwHeadIsCountersunk;
        if (saved.screwHeadCountersunkDegreeValue !== undefined) screwHeadCountersunkDegreeValue.value = saved.screwHeadCountersunkDegreeValue;
        if (saved.backsideScrewHole !== undefined) backsideScrewHole.value = saved.backsideScrewHole;
        if (saved.backsideScrewHeadDiameterShrinkValue !== undefined) backsideScrewHeadDiameterShrinkValue.value = saved.backsideScrewHeadDiameterShrinkValue;
        if (saved.backsideScrewHeadInsetValue !== undefined) backsideScrewHeadInsetValue.value = saved.backsideScrewHeadInsetValue;
        if (saved.backsideScrewHeadIsCountersunk !== undefined) backsideScrewHeadIsCountersunk.value = saved.backsideScrewHeadIsCountersunk;
        if (saved.backsideScrewHeadCountersunkDegreeValue !== undefined) backsideScrewHeadCountersunkDegreeValue.value = saved.backsideScrewHeadCountersunkDegreeValue;
        if (saved.stackCountValue !== undefined) stackCountValue.value = saved.stackCountValue;
        if (saved.stackingMethod) stackingMethod.value = saved.stackingMethod;
        if (saved.interfaceThicknessValue !== undefined) interfaceThicknessValue.value = saved.interfaceThicknessValue;
        if (saved.interfaceSeparationValue !== undefined) interfaceSeparationValue.value = saved.interfaceSeparationValue;
        if (saved.circleSegmentsValue !== undefined) circleSegmentsValue.value = saved.circleSegmentsValue;
        if (saved.width) width.value = saved.width;
        if (saved.height) height.value = saved.height;
        if (saved.top1Text) top1Text.value = saved.top1Text;
        if (saved.top2Text) top2Text.value = saved.top2Text;
        if (saved.maskGrid) maskGrid.value = saved.maskGrid;
      }
    }
  } catch (e) { }

  // Save to local storage
  watch(() => {
    const state = {
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
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  });

  const topo = $(() => deriveTopology(maskGrid.value, width.value, height.value));
  const exportGrid = $(() => sanitizeMask(maskGrid.value, width.value, height.value));
  const exportText = $(() => buildEntryScad({
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

  const downloadScad = () => {
    const element = document.createElement('a');
    const file = new Blob([exportText.value], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = 'opengrid_design.scad';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
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

  const ResizeButtons = ({ onPlus, onMinus, vertical }) => (
    <div class={vertical ? "flex flex-col gap-1 items-center" : "flex flex-row gap-1 items-center"}>
      <button class="w-6 h-6 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded text-gray-700 font-bold text-xs transition" on:click={onPlus}>+</button>
      <button class="w-6 h-6 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded text-gray-700 font-bold text-xs transition" on:click={onMinus}>-</button>
    </div>
  );

  return (
    <div class="h-screen flex overflow-hidden font-sans bg-white">
      {/* Left: Config */}
      <div class="w-[400px] h-full overflow-auto bg-gray-50 border-r flex flex-col z-10">
        <div class="p-8 flex flex-col gap-8">
          <div>
            <h2 class="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <div class="w-2 h-6 bg-blue-600 rounded-full"></div>
              Configuration
            </h2>
            
            <div class="grid gap-6">
              <div class="grid gap-4">
                <div class="text-[10px] font-bold uppercase tracking-widest text-blue-600/70">Shape Helpers</div>
                <div class="grid grid-cols-2 gap-3">
                  <div class="grid gap-1">
                    <label class="text-xs font-medium text-gray-500">Width</label>
                    <input type="number" class="border rounded-lg h-9 px-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full" value={width} on:input={(e) => updateSize(Math.max(1, Number(e.target.value) || 1), height.value)} />
                  </div>
                  <div class="grid gap-1">
                    <label class="text-xs font-medium text-gray-500">Height</label>
                    <input type="number" class="border rounded-lg h-9 px-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full" value={height} on:input={(e) => updateSize(width.value, Math.max(1, Number(e.target.value) || 1))} />
                  </div>
                  {/*<button class="bg-blue-600 text-white rounded-lg h-9 px-4 text-sm font-semibold hover:bg-blue-700 transition" on:click={applyRectangle}>Rectangle</button>*/}
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div class="grid gap-1">
                    <label class="text-xs font-medium text-gray-500">Top col 1</label>
                    <input type="number" class="border rounded-lg h-9 px-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full" value={top1Text} on:input={(e) => top1Text.value = e.target.value} />
                  </div>
                  <div class="grid gap-1">
                    <label class="text-xs font-medium text-gray-500">Top col 2</label>
                    <input type="number" class="border rounded-lg h-9 px-3 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full" value={top2Text} on:input={(e) => top2Text.value = e.target.value} />
                  </div>
                  <button class="bg-blue-600 border text-white rounded-lg h-9 px-4 text-sm font-semibold hover:bg-blue-700 transition col-span-2" on:click={applyTrapezoid}>Apply</button>
                </div>
              </div>

              <div class="grid gap-4 border-t pt-6">
                <div class="text-[10px] font-bold uppercase tracking-widest text-blue-600/70">Presets</div>
                <div class="flex flex-wrap gap-2">
                  {[
                    { label: 'Screws', mode: 'holes_all' },
                    { label: 'Connectors', mode: 'connectors_edge' },
                    { label: 'Chamfers', mode: 'chamfer_all' },
                    { label: 'Clear', mode: 'clear_all' },
                  ].map(({ label, mode }) => (
                    <button class="bg-gray-100 text-gray-600 rounded-lg py-1.5 px-3 text-[10px] font-bold uppercase hover:bg-gray-200 transition tracking-tight" on:click={() => applyHelper(mode)}>{label}</button>
                  ))}
                </div>
              </div>

              <div class="grid gap-4 border-t pt-6">
                <div class="text-[10px] font-bold uppercase tracking-widest text-blue-600/70">Board Type</div>
                <div class="flex gap-4">
                  {['Full', 'Lite', 'Heavy'].map((v) => (
                    <label class="flex items-center gap-2 cursor-pointer group">
                      <input type="radio" class="w-4 h-4 text-blue-600 focus:ring-blue-500/20 border-gray-300" checked={fullOrLite.eq(v)} on:change={() => fullOrLite.value = v} />
                      <span class="text-sm font-medium text-gray-600 group-hover:text-blue-600 transition">{v}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div class="grid gap-4 border-t pt-6">
                <div class="text-[10px] font-bold uppercase tracking-widest text-blue-600/70">Dimensions</div>
                <div class="grid grid-cols-2 gap-x-4 gap-y-3">
                  {[
                    { label: 'Tile Size', step: 1, sig: tileSizeValue },
                    { label: 'Thickness', step: 0.1, sig: tileThicknessValue },
                    { label: 'Lite Thk', step: 0.1, sig: liteTileThicknessValue },
                    { label: 'Heavy Thk', step: 0.1, sig: heavyTileThicknessValue },
                    { label: 'Heavy Gap', step: 0.1, sig: heavyTileGapValue }
                  ].map(({ label, sig, step }) => (
                    <div class="grid gap-1">
                      <label class="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{label}</label>
                      <input type="number" class="border rounded-lg h-8 px-2 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full" step={step} value={sig} on:input={(e) => sig.value = Number(e.target.value) || 0} />
                    </div>
                  ))}
                </div>
              </div>

              <div class="grid gap-4 border-t pt-6">
                <div class="text-[10px] font-bold uppercase tracking-widest text-blue-600/70">Screws</div>
                <div class="grid grid-cols-2 gap-x-4 gap-y-3">
                  {[
                    { label: 'Screw Diameter', step: 0.1, sig: screwDiameterValue },
                    { label: 'Head Diameter', step: 0.1, sig: screwHeadDiameterValue },
                    { label: 'Head Inset', step: 0.1, sig: screwHeadInsetValue },
                    { label: 'Sink Deg', step: 0.1, sig: screwHeadCountersunkDegreeValue },
                  ].map(({ label, sig }) => (
                    <div class="grid gap-1">
                      <label class="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{label}</label>
                      <input type="number" class="border rounded-lg h-8 px-2 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full" step={step} value={sig} on:input={(e) => sig.value = Number(e.target.value) || 0} />
                    </div>
                  ))}
                </div>
                <label class="flex items-center gap-2 text-sm font-medium text-gray-600 cursor-pointer">
                  <input type="checkbox" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500/20" checked={screwHeadIsCountersunk} on:change={(e) => screwHeadIsCountersunk.value = e.target.checked} />
                  Countersunk
                </label>
              </div>



              <If condition={fullOrLite.eq('Lite')}>{() => (
                <div class="grid gap-4 border-t pt-6">
                  <div class="text-[10px] font-bold uppercase tracking-widest text-blue-600/70">Adhesive Base</div>
                  <label class="flex items-center gap-2 text-sm font-medium text-gray-600 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500/20" checked={addAdhesiveBase} on:change={(e) => addAdhesiveBase.value = e.target.checked} />
                    Enable base
                  </label>
                  <div class="grid gap-1">
                    <label class="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Thickness</label>
                    <input type="number" class="border rounded-lg h-8 px-2 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full" value={adhesiveBaseThicknessValue} on:input={(e) => adhesiveBaseThicknessValue.value = Number(e.target.value) || 0} />
                  </div>
                </div>
              )}{() => (
                <div class="grid gap-4 border-t pt-6">
                  <div class="text-[10px] font-bold uppercase tracking-widest text-blue-600/70">Backside Screws</div>
                  <label class="flex items-center gap-2 text-sm font-medium text-gray-600 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500/20" checked={backsideScrewHole} on:change={(e) => backsideScrewHole.value = e.target.checked} />
                    Enable backside
                  </label>
                  <div class="grid grid-cols-2 gap-x-4 gap-y-3">
                    {[
                      { label: 'Head Shrink', step: 0.1, sig: backsideScrewHeadDiameterShrinkValue },
                      { label: 'Head Inset', step: 0.1, sig: backsideScrewHeadInsetValue },
                    ].map(({ label, sig }) => (
                      <div class="grid gap-1">
                        <label class="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{label}</label>
                        <input type="number" class="border rounded-lg h-8 px-2 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full" step={step} value={sig} on:input={(e) => sig.value = Number(e.target.value) || 0} />
                      </div>
                    ))}
                  </div>
                  <label class="flex items-center gap-2 text-sm font-medium text-gray-600 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500/20" checked={backsideScrewHeadIsCountersunk} on:change={(e) => backsideScrewHeadIsCountersunk.value = e.target.checked} />
                    Backside countersunk
                  </label>
                </div>
              )}</If>

              <div class="grid gap-4 border-t pt-4">
                <div class="text-sm font-semibold uppercase tracking-wider text-gray-500">Stacking</div>
                <div class="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div class="grid gap-1">
                    <label class="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Stack Count</label>
                    <input type="number" class="border rounded-lg h-8 px-2 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full" value={stackCountValue} on:input={(e) => stackCountValue.value = Number(e.target.value) || 0} />
                  </div>
                  <div class="grid gap-1">
                    <label class="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Method</label>
                    <select class="border rounded-lg h-8 px-2 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full bg-white" value={stackingMethod} on:change={(e) => stackingMethod.value = e.target.value}>
                      <option>Interface Layer</option>
                      <option>Ironing - BETA</option>
                    </select>
                  </div>
                  <div class="grid gap-1">
                    <label class="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Interface Thickness</label>
                    <input type="number" class="border rounded-lg h-8 px-2 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full" step={0.1} value={interfaceThicknessValue} on:input={(e) => interfaceThicknessValue.value = Number(e.target.value) || 0} />
                  </div>
                  <div class="grid gap-1">
                    <label class="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Separation</label>
                    <input type="number" class="border rounded-lg h-8 px-2 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full" step={0.1} value={interfaceSeparationValue} on:input={(e) => interfaceSeparationValue.value = Number(e.target.value) || 0} />
                  </div>
                </div>
              </div>

              <div class="grid gap-4 border-t pt-4">
                <div class="text-sm font-semibold uppercase tracking-wider text-gray-500">Quality</div>
                <div class="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div class="grid gap-1">
                    <label class="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Segments</label>
                    <input type="number" class="border rounded-lg h-8 px-2 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full" value={circleSegmentsValue} on:input={(e) => circleSegmentsValue.value = Number(e.target.value) || 0} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Preview Area */}
      <div class="flex-1 flex flex-col h-full bg-white relative">
        {/* Title Bar */}
        <div class="h-16 border-b flex items-center justify-between px-8 bg-white z-20 shadow-sm">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-500/30">G</div>
            <h1 class="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">openGrid Studio</h1>
          </div>
          <div class="flex gap-2">
            <button class="bg-white border-2 border-gray-200 text-gray-700 rounded-xl h-10 px-6 text-sm font-bold hover:border-gray-300 transition flex items-center gap-2" on:click={copy}>
              Copy SCAD
            </button>
            <button class="bg-blue-600 text-white rounded-xl h-10 px-8 text-sm font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-lg shadow-blue-600/20" on:click={downloadScad}>
              Download .scad
            </button>
          </div>
        </div>

        {/* Editor Surface */}
        <div class="flex-1 overflow-auto p-12 flex flex-col items-center bg-gray-50/50 relative scrollbar-hide">
          <div class="flex flex-col items-center gap-6 m-auto">
            <ResizeButtons onPlus={() => updateSize(width.value, height.value + 1, 0, 1)} onMinus={() => updateSize(width.value, height.value - 1, 0, -1)} />
            <div class="flex items-center gap-6">
              <ResizeButtons vertical onPlus={() => updateSize(width.value + 1, height.value, 1, 0)} onMinus={() => updateSize(width.value - 1, height.value, -1, 0)} />
              <div class="bg-white rounded-2xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-gray-100 flex items-center justify-center">
                <svg attr:width={svgW} attr:height={svgH} class="rounded-lg border border-gray-100 bg-white">
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

      {/* Copy Modal */}
      <If condition={showModal}>
        {() => (
          <div class="fixed inset-0 z-[100] flex items-center justify-center p-8">
            <div class="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" on:click={() => showModal.value = false}></div>
            <div class="bg-white rounded-3xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden relative animate-in fade-in zoom-in duration-200">
              <div class="p-6 border-b flex justify-between items-center">
                <h3 class="text-xl font-bold text-gray-900">Copy SCAD Code</h3>
                <button class="text-gray-400 hover:text-gray-600 transition" on:click={() => showModal.value = false}>
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
              <div class="p-6 bg-gray-50">
                <textarea 
                  readonly 
                  class="w-full h-80 border rounded-xl p-4 font-mono text-[10px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition leading-tight resize-none" 
                  $ref={(el) => { if (el) { el.select(); } }}
                  value={exportText} 
                />
              </div>
              <div class="p-6 border-t flex justify-end gap-3">
                <button class="bg-gray-100 text-gray-700 rounded-xl px-6 h-11 font-bold hover:bg-gray-200 transition" on:click={() => showModal.value = false}>Close</button>
                <button 
                  class="bg-blue-600 text-white rounded-xl px-8 h-11 font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20" 
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
