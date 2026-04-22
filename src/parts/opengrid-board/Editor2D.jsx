import { $, For, If, read } from "refui";
import { NodeGlyph } from "./BoardGlyphs.jsx";

const EDITOR_2D_RESIZE_BUTTON_RADIUS = 12;

const Editor2DResizeButton = ({ cx, cy, label, action, editor }) => {
	const x = $(() => read(cx));
	const y = $(() => read(cy));

	return (
		<g attr:data-editor-action={action} style="cursor: pointer;">
			<circle
				attr:cx={x}
				attr:cy={y}
				attr:r={EDITOR_2D_RESIZE_BUTTON_RADIUS}
				attr:fill={editor.editor2DResizeButtonFill}
				attr:stroke={editor.editor2DResizeButtonStroke}
				attr:stroke-width="1.5"
			/>
			<g
				attr:stroke={editor.editor2DResizeButtonText}
				attr:stroke-width="1.8"
				attr:stroke-linecap="round"
				style="pointer-events: none; user-select: none;"
			>
				<line
					attr:x1={$(() => x.value - 4.5)}
					attr:y1={y}
					attr:x2={$(() => x.value + 4.5)}
					attr:y2={y}
				/>
				{label === "+" ? (
					<line
						attr:x1={x}
						attr:y1={$(() => y.value - 4.5)}
						attr:x2={x}
						attr:y2={$(() => y.value + 4.5)}
					/>
				) : null}
			</g>
		</g>
	);
};

export default function OpenGridBoardEditor2D({ editor }) {
	return (
		<div class="flex-1 min-h-0 relative overflow-hidden bg-white dark:bg-slate-950">
			<div class="absolute inset-0" style={editor.editor2DBackgroundStyle}></div>
			<div class={editor.editor2DViewportClass} style={editor.editor2DViewportStyle}>
				<div
					class="absolute inset-0 cursor-grab select-none"
					style="touch-action: none;"
					$ref={editor.attach2DEditorViewport}
					on:contextmenu={(event) => event.preventDefault()}
					on:pointerdown={editor.on2DEditorPointerDown}
					on:pointermove={editor.on2DEditorPointerMove}
					on:pointerup={editor.on2DEditorPointerFinish}
					on:pointercancel={editor.on2DEditorPointerFinish}
					on:wheel={editor.on2DEditorWheel}
				>
					<svg
						attr:viewBox={editor.editor2DSvgViewBox}
						attr:preserveAspectRatio={editor.editor2DSvgPreserveAspectRatio}
						attr:width={editor.editor2DSvgWidth}
						attr:height={editor.editor2DSvgHeight}
						class={editor.editor2DSvgClass}
						style={editor.editor2DSvgStyle}
					>
						<defs>
							<clipPath
								attr:id={editor.editor2DBoardMaterialClipId}
								attr:clipPathUnits="userSpaceOnUse"
							>
								<path attr:d={editor.editor2DBoardMaterialPath} />
							</clipPath>
							<mask
								attr:id={editor.editor2DNodeMaskId}
								attr:maskUnits="userSpaceOnUse"
								attr:maskContentUnits="userSpaceOnUse"
								attr:x="0"
								attr:y="0"
								attr:width={editor.svgW}
								attr:height={editor.svgH}
							>
								<rect
									attr:x="0"
									attr:y="0"
									attr:width={editor.svgW}
									attr:height={editor.svgH}
									attr:fill="white"
								/>

								<For entries={editor.nodes} track="id">
									{({ item: { gx, gy } }) => {
										const { x, y } = editor.toNodeXY(gx, gy);
										const kind = $(
											() => editor.topo.value.nodeKind[gy]?.[gx] ?? "none",
										);
										const dir = $(
											() => editor.topo.value.nodeDir[gy]?.[gx] ?? null,
										);
										const state = $(() =>
											editor.nodeState(
												kind.value,
												editor.getMask(editor.maskGrid.value, gx, gy),
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
						</defs>

						<g attr:transform={editor.editor2DSceneTransform}>
							<g attr:mask={`url(#${editor.editor2DNodeMaskId})`}>
								<If condition={$(() => !!editor.editor2DBoardMaterialPath.value)}>
									{() => (
										<path
											attr:d={editor.editor2DBoardMaterialPath}
											attr:fill={editor.editor2DBoardFill}
										/>
									)}
								</If>
								<If condition={$(() => !!editor.editor2DActiveTileInsetPath.value)}>
									{() => (
										<path
											attr:d={editor.editor2DActiveTileInsetPath}
											attr:fill="#2563eb"
										/>
									)}
								</If>
								<If condition={$(() => !!editor.editor2DNodeOverlayPath.value)}>
									{() => (
										<path
											attr:d={editor.editor2DNodeOverlayPath}
											attr:fill={editor.editor2DBoardFill}
											attr:clip-path={`url(#${editor.editor2DBoardMaterialClipId})`}
										/>
									)}
								</If>
							</g>

							<For entries={editor.tiles} track="id">
								{({ item: { tx, ty, gx, gy } }) => (
									<rect
										attr:data-editor-action="tile"
										attr:data-gx={gx}
										attr:data-gy={gy}
										attr:x={editor.pad + tx * editor.tileSize}
										attr:y={editor.pad + ty * editor.tileSize}
										attr:width={editor.tileSize}
										attr:height={editor.tileSize}
										attr:fill="transparent"
									/>
								)}
							</For>

							<For entries={editor.nodes} track="id">
								{({ item: { gx, gy } }) => {
									const { x, y } = editor.toNodeXY(gx, gy);
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

							<Editor2DResizeButton
								cx={editor.editor2DTopAddX}
								cy={editor.editor2DTopControlY}
								label="+"
								action="top-add"
								editor={editor}
							/>
							<Editor2DResizeButton
								cx={editor.editor2DTopRemoveX}
								cy={editor.editor2DTopControlY}
								label="-"
								action="top-remove"
								editor={editor}
							/>
							<Editor2DResizeButton
								cx={editor.editor2DLeftControlX}
								cy={editor.editor2DLeftAddY}
								label="+"
								action="left-add"
								editor={editor}
							/>
							<Editor2DResizeButton
								cx={editor.editor2DLeftControlX}
								cy={editor.editor2DLeftRemoveY}
								label="-"
								action="left-remove"
								editor={editor}
							/>
							<Editor2DResizeButton
								cx={editor.editor2DRightControlX}
								cy={editor.editor2DRightAddY}
								label="+"
								action="right-add"
								editor={editor}
							/>
							<Editor2DResizeButton
								cx={editor.editor2DRightControlX}
								cy={editor.editor2DRightRemoveY}
								label="-"
								action="right-remove"
								editor={editor}
							/>
							<Editor2DResizeButton
								cx={editor.editor2DBottomAddX}
								cy={editor.editor2DBottomControlY}
								label="+"
								action="bottom-add"
								editor={editor}
							/>
							<Editor2DResizeButton
								cx={editor.editor2DBottomRemoveX}
								cy={editor.editor2DBottomControlY}
								label="-"
								action="bottom-remove"
								editor={editor}
							/>
						</g>
					</svg>
				</div>
			</div>
			<If condition={editor.editor2DShowHint}>
				{() => (
					<div class={editor.editor2DHintClass}>
						Drag to pan. Wheel or pinch to zoom. Click/tap to edit.
					</div>
				)}
			</If>
		</div>
	);
}
