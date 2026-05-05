import {
	PICA_OPEN_GRID_LENGTH_DEFAULT,
	PICA_OPEN_GRID_TILE_SIZE_DEFAULT,
	PICA_SCREW_HOLE_SEGMENTS_DEFAULT,
} from "./constants.js";

export const PICARAIL_DEFAULT_CONFIG = Object.freeze({
	openGridTileSizeValue: PICA_OPEN_GRID_TILE_SIZE_DEFAULT,
	openGridTileLength: PICA_OPEN_GRID_LENGTH_DEFAULT,
	extendEnds: true,
	screwHoleTiles: Object.freeze([]),
	screwHoleSegmentsValue: PICA_SCREW_HOLE_SEGMENTS_DEFAULT,
});

export function createPicaRailDefaultConfig() {
	return {
		...PICARAIL_DEFAULT_CONFIG,
	};
}
