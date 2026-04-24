import { createDefaultTileDimensions } from "../shared/tile-dimensions.js";

export function createUnderwareDefaultConfig() {
	return {
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
		circleSegmentsValue: 64,
		partVariant: "channel",
	};
}
