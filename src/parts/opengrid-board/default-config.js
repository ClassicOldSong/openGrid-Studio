import { buildRectangleMask } from "./model.js";
import { createDefaultTileDimensions } from "../shared/tile-dimensions.js";

export const OPEN_GRID_BOARD_DEFAULT_CONFIG = Object.freeze({
	width: 4,
	height: 4,
	top1Text: "0",
	top2Text: "0",
	maskGrid: buildRectangleMask(4, 4),
	fullOrLite: "Full",
	...createDefaultTileDimensions(),
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
});

export function createOpenGridBoardDefaultConfig() {
	return {
		...OPEN_GRID_BOARD_DEFAULT_CONFIG,
		maskGrid: OPEN_GRID_BOARD_DEFAULT_CONFIG.maskGrid.map((row) => [...row]),
	};
}
