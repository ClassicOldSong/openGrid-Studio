import { OPEN_GRID_BOARD_METADATA } from "./metadata.js";

function toScad2DArray(grid) {
	const rows = grid.map((row) => `  [${row.join(", ")}]`);
	return `[\n${rows.join(",\n")}\n]`;
}

function toScadBool(value) {
	return value ? "true" : "false";
}

function shortHash(text) {
	let hash = 2166136261;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}

export function buildOpenGridBoardExportFilename(config, formatMeta) {
	const boardWidth = Math.max(0, (config.exportGrid?.[0]?.length ?? 1) - 1);
	const boardHeight = Math.max(0, (config.exportGrid?.length ?? 1) - 1);
	const effectiveStackCount = config.addAdhesiveBase
		? 1
		: Math.max(1, Number(config.stackCountValue) || 1);
	const boardType = String(config.fullOrLite || "board")
		.trim()
		.toLowerCase();
	const hash = shortHash(JSON.stringify(config));

	return `${OPEN_GRID_BOARD_METADATA.slug}_${boardType}_${boardWidth}x${boardHeight}_stack${effectiveStackCount}_${hash}.${formatMeta.extension}`;
}

export function buildOpenGridBoardEntryScad(config) {
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
