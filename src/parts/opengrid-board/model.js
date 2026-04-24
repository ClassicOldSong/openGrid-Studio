const BITS = {
	TILE: 1,
	HOLE: 2,
	CHAMFER: 4,
};

function clamp(v, lo, hi) {
	return Math.max(lo, Math.min(hi, v));
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

function parseTopColumnInput(v) {
	const t = String(v).trim();
	if (t === "") return 0;
	const n = Number(t);
	return Number.isFinite(n) ? n : 0;
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

function resizeMask(oldGrid, oldW, oldH, nextW, nextH, offsetX = 0, offsetY = 0) {
	const nextGrid = makeMaskGrid(nextW, nextH, 0);

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
				nextGrid[ny][nx] = oldGrid[y][x];
			}
		}
	}

	return enableOuterCornerChamfers(nextGrid, nextW, nextH);
}

export {
	BITS,
	applyPreset,
	buildRectangleMask,
	buildTrapezoidMask,
	cloneGrid,
	deriveTopology,
	getMask,
	gridSize,
	hasBit,
	isNodePos,
	makeMaskGrid,
	nodeState,
	resizeMask,
	sanitizeMask,
	tileCoordToGrid,
	tileFill,
};
