export const PIPEWARE_PART_ID = "pipeware";

export const PIPEWARE_METADATA = {
	id: PIPEWARE_PART_ID,
	name: "Pipeware",
	description: "Continuous pipeware channel generation from tile connectivity.",
	credit: {
		label: "Inspired by the Underware system by Katie",
		url: "https://www.handsonkatie.com/underware",
	},
	accessories: [
		{
			name: "SuperGrip snap for Pipeware",
			url: "https://www.printables.com/model/1703971-underware-super-grip-snap-for-opengrid",
		},
	],
	profileImage: "/logo.png",
	profileImageAlt: "Pipeware part placeholder image",
	kind: "board",
	slug: "pipeware",
	load: () => import("./frontend.js").then((module) => module.PIPEWARE_FRONTEND_PART),
};
