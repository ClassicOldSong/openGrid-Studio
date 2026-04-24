import { createUnderwareDefaultConfig } from "./default-config.js";

export const UNDERWARE_PART_ID = "underware";

export const UNDERWARE_METADATA = Object.freeze({
	id: UNDERWARE_PART_ID,
	name: "Underware",
	description: "Continuous underware channel generation from tile connectivity.",
	profileImage: "/logo.png",
	profileImageAlt: "Underware part placeholder image",
	kind: "board",
	slug: "underware",
	createDefaultConfig: createUnderwareDefaultConfig,
	load: () => import("./index.js").then((module) => module.UNDERWARE_PART),
});
