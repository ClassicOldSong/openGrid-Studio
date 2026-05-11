import { PICARAIL_PART_ID } from "./constants.js";

export const PICARAIL_METADATA = Object.freeze({
	id: PICARAIL_PART_ID,
	name: "PicaRail",
	description:
		"Generate picatinny-style rail using OpenGrid tile-length-driven spacing.",
	accessories: Object.freeze([
		Object.freeze({
			name: "PicaRail lock pin",
			url: "https://www.printables.com/model/1712315-superconnect-picarail-with-generator",
		}),
	]),
	profileImage: "/logo.png",
	profileImageAlt: "PicaRail part placeholder image",
	kind: "board",
	slug: "picarail",
	load: () =>
		import("./frontend.js").then((module) => module.PICARAIL_FRONTEND_PART),
});
