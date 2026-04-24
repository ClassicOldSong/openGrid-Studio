export const PIPEWARE_PART_ID = "pipeware";

export const PIPEWARE_METADATA = Object.freeze({
	id: PIPEWARE_PART_ID,
	name: "Pipeware",
	description: "Continuous pipeware channel generation from tile connectivity.",
	credit: Object.freeze({
		label: "Based on the Underware system by Katie",
		url: "https://www.handsonkatie.com/underware",
	}),
	profileImage: "/logo.png",
	profileImageAlt: "Pipeware part placeholder image",
	kind: "board",
	slug: "pipeware",
	load: () => import("./frontend.js").then((module) => module.PIPEWARE_FRONTEND_PART),
});
