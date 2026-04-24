import { $, For, If } from "refui";
import { NodeGlyph } from "./BoardGlyphs.jsx";

export function OpenGridBoardEditor2DDefs({ scene }) {
	return (
		<>
			<clipPath
				attr:id={scene.editor2DBoardMaterialClipId}
				attr:clipPathUnits="userSpaceOnUse"
			>
				<path attr:d={scene.editor2DBoardMaterialPath} />
			</clipPath>
			<mask
				attr:id={scene.editor2DNodeMaskId}
				attr:maskUnits="userSpaceOnUse"
				attr:maskContentUnits="userSpaceOnUse"
				attr:x="0"
				attr:y="0"
				attr:width={scene.svgW}
				attr:height={scene.svgH}
			>
				<rect
					attr:x="0"
					attr:y="0"
					attr:width={scene.svgW}
					attr:height={scene.svgH}
					attr:fill="white"
				/>

				<For entries={scene.nodes} track="id">
					{({ item: { gx, gy } }) => {
						const { x, y } = scene.toNodeXY(gx, gy);
						const kind = $(() => scene.topo.value.nodeKind[gy]?.[gx] ?? "none");
						const dir = $(() => scene.topo.value.nodeDir[gy]?.[gx] ?? null);
						const state = $(() =>
							scene.nodeState(
								kind.value,
								scene.getMask(scene.maskGrid.value, gx, gy),
							),
						);
						return (
							<NodeGlyph
								kind={kind}
								state={state}
								x={x}
								y={y}
								dir={dir}
								innerFill="black"
							/>
						);
					}}
				</For>
			</mask>
		</>
	);
}

export function OpenGridBoardEditor2DLayers({ scene }) {
	return (
		<g attr:mask={`url(#${scene.editor2DNodeMaskId})`}>
			<If condition={$(() => !!scene.editor2DBoardMaterialPath.value)}>
				{() => (
					<path
						attr:d={scene.editor2DBoardMaterialPath}
						attr:fill={scene.editor2DBoardFill}
					/>
				)}
			</If>
			<If condition={$(() => !!scene.editor2DActiveTileInsetPath.value)}>
				{() => (
					<path
						attr:d={scene.editor2DActiveTileInsetPath}
						attr:fill="#2563eb"
					/>
				)}
			</If>
			<If condition={$(() => !!scene.editor2DNodeOverlayPath.value)}>
				{() => (
					<path
						attr:d={scene.editor2DNodeOverlayPath}
						attr:fill={scene.editor2DBoardFill}
						attr:clip-path={`url(#${scene.editor2DBoardMaterialClipId})`}
					/>
				)}
			</If>
		</g>
	);
}

export function OpenGridBoardEditor2DHitTargets({ scene }) {
	return (
		<>
			<For entries={scene.tiles} track="id">
				{({ item: { tx, ty, gx, gy } }) => (
					<rect
						attr:data-editor-action="tile"
						attr:data-gx={gx}
						attr:data-gy={gy}
						attr:x={scene.pad + tx * scene.tileSize}
						attr:y={scene.pad + ty * scene.tileSize}
						attr:width={scene.tileSize}
						attr:height={scene.tileSize}
						attr:fill="transparent"
					/>
				)}
			</For>

			<For entries={scene.nodes} track="id">
				{({ item: { gx, gy } }) => {
					const { x, y } = scene.toNodeXY(gx, gy);
					return (
						<circle
							attr:data-editor-action="node"
							attr:data-gx={gx}
							attr:data-gy={gy}
							attr:cx={x}
							attr:cy={y}
							attr:r={20}
							attr:fill="transparent"
						/>
					);
				}}
			</For>
		</>
	);
}

export const OPEN_GRID_BOARD_EDITOR_2D_RENDERERS = Object.freeze({
	Defs: OpenGridBoardEditor2DDefs,
	Layers: OpenGridBoardEditor2DLayers,
	HitTargets: OpenGridBoardEditor2DHitTargets,
});
