export const TILE_BIT = 1
export const HOLE_BIT = 2
export const CHAMFER_BIT = 4

function bitHas(value, bit) {
	return (value & bit) !== 0
}

function cellCenter(boardW, boardH, cx, cy, tileSize) {
	return [
		(-tileSize * boardW) / 2 + tileSize / 2 + cx * tileSize,
		(tileSize * boardH) / 2 - tileSize / 2 - cy * tileSize
	]
}

function nodePos(boardW, boardH, ix, iy, tileSize) {
	return [(-tileSize * boardW) / 2 + ix * tileSize, (tileSize * boardH) / 2 - iy * tileSize]
}

function classifyNode(exportGrid, boardW, boardH, ix, iy) {
	const tileExists = (cx, cy) =>
		cx >= 0 && cx < boardW && cy >= 0 && cy < boardH && bitHas(exportGrid[cy]?.[cx] ?? 0, TILE_BIT)

	const nw = tileExists(ix - 1, iy - 1)
	const ne = tileExists(ix, iy - 1)
	const sw = tileExists(ix - 1, iy)
	const se = tileExists(ix, iy)
	const count = [nw, ne, sw, se].filter(Boolean).length

	if (count === 4) return { kind: 'full', rotation: 0 }
	if (count === 3) return { kind: 'inner', rotation: 0 }
	if (count === 1) return { kind: 'outer', rotation: 0 }
	if (count !== 2) return { kind: 'none', rotation: 0 }

	if (nw && ne) return { kind: 'edge', rotation: 90 }
	if (sw && se) return { kind: 'edge', rotation: -90 }
	if (nw && sw) return { kind: 'edge', rotation: 180 }
	if (ne && se) return { kind: 'edge', rotation: 0 }
	return { kind: 'diag', rotation: 0 }
}

export function buildPlacementData(exportGrid, tileSize) {
	const boardH = exportGrid.length - 1
	const boardW = exportGrid[0].length - 1
	const tileCenters = []
	const fillNodes = []
	const holeNodes = []
	const chamferNodes = []
	const connectorNodes = []

	for (let cy = 0; cy < boardH; cy++) {
		for (let cx = 0; cx < boardW; cx++) {
			if (bitHas(exportGrid[cy][cx], TILE_BIT)) {
				tileCenters.push(cellCenter(boardW, boardH, cx, cy, tileSize))
			}
		}
	}

	for (let iy = 0; iy <= boardH; iy++) {
		for (let ix = 0; ix <= boardW; ix++) {
			const raw = exportGrid[iy][ix]
			const { kind, rotation } = classifyNode(exportGrid, boardW, boardH, ix, iy)
			if (kind === 'none') continue

			const p = nodePos(boardW, boardH, ix, iy, tileSize)

			if (kind === 'full' || kind === 'inner' || kind === 'diag') {
				fillNodes.push(p)
			}

			const hasHole = bitHas(raw, HOLE_BIT)
			const hasChamfer = bitHas(raw, CHAMFER_BIT)

			if (hasHole) {
				if (kind === 'full' || kind === 'inner' || kind === 'diag') {
					holeNodes.push(p)
				} else if (kind === 'edge') {
					connectorNodes.push([...p, rotation])
				}
			} else if (hasChamfer) {
				chamferNodes.push(p)
			}
		}
	}

	return {
		boardW,
		boardH,
		tileCenters,
		fillNodes,
		holeNodes,
		chamferNodes,
		connectorNodes
	}
}
