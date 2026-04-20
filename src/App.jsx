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
  const width = signal(6);
  const height = signal(4);
  const top1Text = signal('0');
  const top2Text = signal('0');
  const maskGrid = signal(buildRectangleMask(6, 4));

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

  const applyRectangle = () => {
    maskGrid.value = buildRectangleMask(width.value, height.value);
    top1Text.value = '0';
    top2Text.value = '0';
  };

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
      alert('Copied!');
    } catch { }
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
    <div class={$(() => vertical ? "flex flex-col gap-1 items-center" : "flex gap-1 items-center")}>
      <button class="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-gray-600 font-bold text-sm transition" on:click={onPlus}>+</button>
      <button class="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-gray-600 font-bold text-sm transition" on:click={onMinus}>-</button>
    </div>
  );

  return (
    <div class="p-6 grid gap-6 max-w-7xl mx-auto font-sans">
      <div class="bg-white rounded-2xl shadow-sm border p-6 overflow-hidden">
        <h2 class="text-xl font-bold mb-6">Board editor</h2>
        <div class="flex flex-col items-center gap-4">
          <ResizeButtons onPlus={() => updateSize(width.value, height.value + 1, 0, 1)} onMinus={() => updateSize(width.value, height.value - 1, 0, -1)} />
          <div class="flex items-center gap-4">
            <ResizeButtons vertical onPlus={() => updateSize(width.value + 1, height.value, 1, 0)} onMinus={() => updateSize(width.value - 1, height.value, -1, 0)} />
            <div class="overflow-auto bg-gray-100 rounded-xl p-8 shadow-inner border max-w-full">
              <svg attr:width={svgW} attr:height={svgH} class="rounded-lg border bg-white shadow-md">
                <rect attr:x={pad} attr:y={pad} attr:width={boardW} attr:height={boardH} attr:fill="#000" />

                {/* Layer 1: Inactive tiles (Holes) */}
                <For entries={tiles} track="id">
                  {({ item: { tx, ty, gx, gy } }) => {
                    const active = $(() => tileFill(getMask(maskGrid.value, gx, gy)));
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

                {/* Layer 2: Active tiles (Blue) */}
                <For entries={tiles} track="id">
                  {({ item: { tx, ty, gx, gy } }) => {
                    const active = $(() => tileFill(getMask(maskGrid.value, gx, gy)));
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

                {/* Layer 3: Nodes */}
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

                {/* Layer 4: Hitboxes (tiles) */}
                <For entries={tiles} track="id">
                  {({ item: { tx, ty, gx, gy } }) => (
                    <rect
                      attr:x={pad + tx * tileSize} attr:y={pad + ty * tileSize}
                      attr:width={tileSize} attr:height={tileSize}
                      attr:fill="transparent" on:click={() => toggleTile(gx, gy)} style="cursor: pointer"
                    />
                  )}
                </For>

                {/* Layer 5: Hitboxes (nodes) */}
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

      <div class="bg-white rounded-2xl shadow-sm border p-6 grid gap-6">
        <h2 class="text-xl font-bold">Configuration</h2>

        <div class="grid gap-4">
          <div class="text-sm font-semibold uppercase tracking-wider text-gray-500">Shape Helpers</div>
          <div class="grid md:grid-cols-4 gap-4 items-end">
            <div class="grid gap-1">
              <label class="text-sm font-medium">Width</label>
              <input type="number" class="border rounded-lg h-10 px-3" value={width} on:input={(e) => updateSize(Math.max(1, Number(e.target.value) || 1), height.value)} />
            </div>
            <div class="grid gap-1">
              <label class="text-sm font-medium">Height</label>
              <input type="number" class="border rounded-lg h-10 px-3" value={height} on:input={(e) => updateSize(width.value, Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <button class="bg-blue-600 text-white rounded-lg h-10 px-4 font-medium hover:bg-blue-700 transition" on:click={applyRectangle}>Rectangle</button>
          </div>
          <div class="grid md:grid-cols-4 gap-4 items-end">
            <div class="grid gap-1">
              <label class="text-sm font-medium">Top col 1 (0=rect)</label>
              <input type="number" class="border rounded-lg h-10 px-3" value={top1Text} on:input={(e) => top1Text.value = e.target.value} />
            </div>
            <div class="grid gap-1">
              <label class="text-sm font-medium">Top col 2 (0=rect)</label>
              <input type="number" class="border rounded-lg h-10 px-3" value={top2Text} on:input={(e) => top2Text.value = e.target.value} />
            </div>
            <button class="bg-gray-100 text-gray-700 rounded-lg h-10 px-4 font-medium hover:bg-gray-200 transition" on:click={applyTrapezoid}>Apply Trapezoid</button>
          </div>
        </div>

        <div class="grid gap-4 border-t pt-4">
          <div class="text-sm font-semibold uppercase tracking-wider text-gray-500">Board Type</div>
          <div class="flex gap-6">
            <For entries={['Full', 'Lite', 'Heavy']}>
              {({ item: v }) => (
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="radio" class="w-4 h-4 text-blue-600" attr:checked={$(() => fullOrLite.value === v)} on:change={() => fullOrLite.value = v} />
                  <span class="text-sm">{v}</span>
                </label>
              )}
            </For>
          </div>
        </div>

        <div class="grid gap-4 border-t pt-4">
          <div class="text-sm font-semibold uppercase tracking-wider text-gray-500">Dimensions</div>
          <div class="grid md:grid-cols-5 gap-4">
            {[
              { label: 'Tile Size', sig: tileSizeValue },
              { label: 'Thickness', sig: tileThicknessValue },
              { label: 'Lite Thk', sig: liteTileThicknessValue },
              { label: 'Heavy Thk', sig: heavyTileThicknessValue },
              { label: 'Heavy Gap', sig: heavyTileGapValue },
            ].map(({ label, sig }) => (
              <div class="grid gap-1">
                <label class="text-xs font-medium text-gray-600">{label}</label>
                <input type="number" class="border rounded-lg h-9 px-2 text-sm" value={sig} on:input={(e) => sig.value = Number(e.target.value) || 0} />
              </div>
            ))}
          </div>
        </div>

        <div class="grid gap-4 border-t pt-4">
          <div class="text-sm font-semibold uppercase tracking-wider text-gray-500">Adhesive Base</div>
          <div class="grid md:grid-cols-4 gap-4 items-end">
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" class="w-4 h-4 text-blue-600" attr:checked={addAdhesiveBase} on:change={(e) => addAdhesiveBase.value = e.target.checked} />
              Enable adhesive base
            </label>
            <div class="grid gap-1">
              <label class="text-xs font-medium text-gray-600">Adhesive thickness</label>
              <input type="number" class="border rounded-lg h-9 px-2 text-sm" value={adhesiveBaseThicknessValue} on:input={(e) => adhesiveBaseThicknessValue.value = Number(e.target.value) || 0} />
            </div>
          </div>
        </div>

        <div class="grid gap-4 border-t pt-4">
          <div class="text-sm font-semibold uppercase tracking-wider text-gray-500">Screw Hole Settings</div>
          <div class="grid md:grid-cols-5 gap-4 items-end">
            <div class="grid gap-1">
              <label class="text-xs font-medium text-gray-600">Screw Diameter</label>
              <input type="number" class="border rounded-lg h-9 px-2 text-sm" value={screwDiameterValue} on:input={(e) => screwDiameterValue.value = Number(e.target.value) || 0} />
            </div>
            <div class="grid gap-1">
              <label class="text-xs font-medium text-gray-600">Head Diameter</label>
              <input type="number" class="border rounded-lg h-9 px-2 text-sm" value={screwHeadDiameterValue} on:input={(e) => screwHeadDiameterValue.value = Number(e.target.value) || 0} />
            </div>
            <div class="grid gap-1">
              <label class="text-xs font-medium text-gray-600">Head Inset</label>
              <input type="number" class="border rounded-lg h-9 px-2 text-sm" value={screwHeadInsetValue} on:input={(e) => screwHeadInsetValue.value = Number(e.target.value) || 0} />
            </div>
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" class="w-4 h-4 text-blue-600" attr:checked={screwHeadIsCountersunk} on:change={(e) => screwHeadIsCountersunk.value = e.target.checked} />
              Countersunk
            </label>
            <div class="grid gap-1">
              <label class="text-xs font-medium text-gray-600">Sink Degree</label>
              <input type="number" class="border rounded-lg h-9 px-2 text-sm" value={screwHeadCountersunkDegreeValue} on:input={(e) => screwHeadCountersunkDegreeValue.value = Number(e.target.value) || 0} />
            </div>
          </div>
        </div>

        <div class="grid gap-4 border-t pt-4">
          <div class="text-sm font-semibold uppercase tracking-wider text-gray-500">Backside Screw Hole</div>
          <div class="grid md:grid-cols-5 gap-4 items-end">
            <label class="flex items-center gap-2 text-sm cursor-pointer col-span-2">
              <input type="checkbox" class="w-4 h-4 text-blue-600" attr:checked={backsideScrewHole} on:change={(e) => backsideScrewHole.value = e.target.checked} />
              Enable backside screw hole
            </label>
            <div class="grid gap-1">
              <label class="text-xs font-medium text-gray-600">Head Shrink</label>
              <input type="number" class="border rounded-lg h-9 px-2 text-sm" value={backsideScrewHeadDiameterShrinkValue} on:input={(e) => backsideScrewHeadDiameterShrinkValue.value = Number(e.target.value) || 0} />
            </div>
            <div class="grid gap-1">
              <label class="text-xs font-medium text-gray-600">Head Inset</label>
              <input type="number" class="border rounded-lg h-9 px-2 text-sm" value={backsideScrewHeadInsetValue} on:input={(e) => backsideScrewHeadInsetValue.value = Number(e.target.value) || 0} />
            </div>
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" class="w-4 h-4 text-blue-600" attr:checked={backsideScrewHeadIsCountersunk} on:change={(e) => backsideScrewHeadIsCountersunk.value = e.target.checked} />
              Backside countersunk
            </label>
          </div>
        </div>

        <div class="grid gap-4 border-t pt-4">
          <div class="text-sm font-semibold uppercase tracking-wider text-gray-500">Stacking & Quality</div>
          <div class="grid md:grid-cols-5 gap-4 items-end">
            <div class="grid gap-1">
              <label class="text-xs font-medium text-gray-600">Stack Count</label>
              <input type="number" class="border rounded-lg h-9 px-2 text-sm" value={stackCountValue} on:input={(e) => stackCountValue.value = Number(e.target.value) || 0} />
            </div>
            <div class="grid gap-1">
              <label class="text-xs font-medium text-gray-600">Method</label>
              <select class="border rounded-lg h-9 px-2 text-sm bg-white" value={stackingMethod} on:change={(e) => stackingMethod.value = e.target.value}>
                <option>Interface Layer</option>
                <option>Ironing - BETA</option>
              </select>
            </div>
            <div class="grid gap-1">
              <label class="text-xs font-medium text-gray-600">Interface Thk</label>
              <input type="number" class="border rounded-lg h-9 px-2 text-sm" value={interfaceThicknessValue} on:input={(e) => interfaceThicknessValue.value = Number(e.target.value) || 0} />
            </div>
            <div class="grid gap-1">
              <label class="text-xs font-medium text-gray-600">Separation</label>
              <input type="number" class="border rounded-lg h-9 px-2 text-sm" value={interfaceSeparationValue} on:input={(e) => interfaceSeparationValue.value = Number(e.target.value) || 0} />
            </div>
            <div class="grid gap-1">
              <label class="text-xs font-medium text-gray-600">Segments</label>
              <input type="number" class="border rounded-lg h-9 px-2 text-sm" value={circleSegmentsValue} on:input={(e) => circleSegmentsValue.value = Number(e.target.value) || 0} />
            </div>
          </div>
        </div>

        <div class="grid gap-4 border-t pt-4">
          <div class="text-sm font-semibold uppercase tracking-wider text-gray-500">Presets</div>
          <div class="flex flex-wrap gap-2">
            {[
              { label: 'Screws Everywhere', mode: 'holes_all' },
              { label: 'Edge Connectors', mode: 'connectors_edge' },
              { label: 'Chamfer All', mode: 'chamfer_all' },
              { label: 'Clear Features', mode: 'clear_all' },
            ].map(({ label, mode }) => (
              <button class="bg-gray-100 text-gray-700 rounded-lg py-2 px-4 text-sm font-medium hover:bg-gray-200 transition" on:click={() => applyHelper(mode)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div class="bg-white rounded-2xl shadow-sm border p-6 grid gap-4">
        <div class="flex justify-between items-center">
          <h2 class="text-lg font-bold">Export Entry SCAD</h2>
          <div class="flex gap-2">
            <button class="bg-gray-100 text-gray-700 rounded-lg py-2 px-4 text-sm font-medium hover:bg-gray-200 transition" on:click={() => maskGrid.value = clearNonTileBits(maskGrid.value)}>Clear Features</button>
            <button class="bg-blue-600 text-white rounded-lg py-2 px-4 text-sm font-medium hover:bg-blue-700 transition" on:click={copy}>Copy SCAD</button>
          </div>
        </div>
        <textarea readonly class="w-full h-64 border rounded-xl p-4 font-mono text-xs bg-gray-50" value={exportText} />
      </div>
    </div>
  );
}
