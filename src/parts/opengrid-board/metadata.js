import { createOpenGridBoardDefaultConfig } from "./default-config.js";

export const OPEN_GRID_BOARD_PART_ID = "opengrid-board";

export const OPEN_GRID_BOARD_METADATA = Object.freeze({
	id: OPEN_GRID_BOARD_PART_ID,
	name: "openGrid Board",
	description:
		"Parametric openGrid board generation with realtime preview and direct export.",
	profileImage: "/logo.png",
	profileImageAlt: "openGrid Studio logo",
	kind: "board",
	slug: "opengrid",
	createDefaultConfig: createOpenGridBoardDefaultConfig,
	load: () =>
		import("./index.js").then((module) => module.OPEN_GRID_BOARD_PART),
});
