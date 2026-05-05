import { For } from "refui";

export function PicaRailEditor2DLayers({ scene }) {
	return (
		<g attr:transform={scene.contentTransform}>
			<For entries={scene.openGridTiles} track="id">
				{({ item }) => (
					<rect
						attr:x={item.x}
						attr:y={item.y}
						attr:width={item.width}
						attr:height={item.height}
						attr:fill={scene.openGridFill}
						attr:stroke={scene.openGridStroke}
						attr:stroke-width="1"
					/>
				)}
			</For>
			<path
				attr:d={scene.railBodyPath}
				attr:fill={scene.bodyFill}
				attr:stroke={scene.bodyStroke}
				attr:stroke-width="1"
			/>
			<For entries={scene.railShoulderPaths} track="id">
				{({ item }) => (
					<path
						attr:d={item.path}
						attr:fill={scene.shoulderFill}
						attr:stroke="none"
					/>
				)}
			</For>
			<path
				attr:d={scene.railTopFlatPath}
				attr:fill={scene.topFlatFill}
				attr:stroke="none"
			/>
			<For entries={scene.railSlots} track="id">
				{({ item }) => (
					<path
						attr:d={item.path}
						attr:fill={scene.gapFill}
						attr:stroke="none"
					/>
				)}
			</For>
		</g>
	);
}

export const PICARAIL_EDITOR_2D_RENDERERS = Object.freeze({
	Layers: PicaRailEditor2DLayers,
});
