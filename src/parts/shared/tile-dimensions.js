export const DEFAULT_TILE_DIMENSIONS = Object.freeze({
	tileSizeValue: 28,
	tileThicknessValue: 6.8,
	liteTileThicknessValue: 4,
	heavyTileThicknessValue: 13.8,
	heavyTileGapValue: 0.2,
});

export function createDefaultTileDimensions() {
	return { ...DEFAULT_TILE_DIMENSIONS };
}
