import { For, If } from "refui";

function PipewareGridLayer({ scene }) {
	return (
		<g>
			<rect
				attr:x={scene.pad}
				attr:y={scene.pad}
				attr:width={scene.boardWidthPx}
				attr:height={scene.boardHeightPx}
				attr:fill={scene.boardSurfaceFill}
			/>
			<For entries={scene.gridTiles} track="id">
				{({ item }) => (
					<rect
						attr:x={item.x}
						attr:y={item.y}
						attr:width={scene.tileSize}
						attr:height={scene.tileSize}
						attr:fill="none"
						attr:stroke={scene.gridStroke}
						attr:stroke-width="1"
					/>
				)}
			</For>
		</g>
	);
}

function PipewarePlacementsLayer({ scene }) {
	return (
		<g>
			<For entries={scene.placements} track="renderKey">
				{({ item }) => (
					<g attr:opacity={item.groupOpacity ?? 1}>
						<If condition={item.hasMask}>
							{() => (
								<defs>
									<mask
										attr:id={item.maskId}
										attr:x={item.maskBounds.x}
										attr:y={item.maskBounds.y}
										attr:width={item.maskBounds.w}
										attr:height={item.maskBounds.h}
										attr:maskUnits="userSpaceOnUse"
										attr:maskContentUnits="userSpaceOnUse"
									>
										<rect
											attr:x={item.maskBounds.x}
											attr:y={item.maskBounds.y}
											attr:width={item.maskBounds.w}
											attr:height={item.maskBounds.h}
											attr:fill="white"
										/>
										<For entries={item.portClipShapes} track="id">
											{({ item: clip }) => (
												<rect
													attr:x={clip.x}
													attr:y={clip.y}
													attr:width={clip.w}
													attr:height={clip.h}
													attr:fill="black"
												/>
											)}
										</For>
										<For entries={item.notchShapes} track="id">
											{({ item: notch }) => (
												<path
													attr:d={notch.path}
													attr:fill={notch.fill ?? "none"}
													attr:stroke={notch.stroke ?? "black"}
													attr:stroke-width={notch.strokeWidth ?? 0}
													attr:stroke-linecap={notch.lineCap ?? "round"}
													attr:stroke-linejoin={notch.lineJoin ?? "round"}
												/>
											)}
										</For>
									</mask>
								</defs>
							)}
						</If>
						<For entries={item.bodyShapes} track="id">
							{({ item: shape }) => (
								<path
									attr:d={shape.path}
									attr:fill={item.fill}
									attr:stroke={item.stroke}
									attr:stroke-width={shape.strokeWidth}
									attr:stroke-opacity={item.strokeOpacity ?? 1}
									attr:stroke-dasharray={item.strokeDasharray}
									attr:stroke-linecap={item.lineCap}
									attr:stroke-linejoin={item.lineJoin}
									attr:mask={item.hasMask ? `url(#${item.maskId})` : undefined}
								/>
							)}
						</For>
						<For entries={item.directionMarkers} track="id">
							{({ item: marker }) => (
								<path
									attr:d={marker.path}
									attr:fill={item.directionMarkerFill}
									attr:fill-opacity={item.directionMarkerOpacity}
									attr:pointer-events="none"
								/>
							)}
						</For>
					</g>
				)}
			</For>
			<For entries={scene.placements} track="renderKey">
				{({ item }) => (
					<If condition={item.selected}>
						{() => (
							<rect
								attr:x={item.bounds.x}
								attr:y={item.bounds.y}
								attr:width={item.bounds.w}
								attr:height={item.bounds.h}
								attr:fill="none"
								attr:stroke={scene.selectionStroke}
								attr:stroke-width="2"
								attr:stroke-opacity={scene.selectionStrokeOpacity}
								attr:stroke-dasharray="8 6"
								attr:rx="10"
							/>
						)}
					</If>
				)}
			</For>
		</g>
	);
}

function PipewareOpeningTargetsLayer({ scene }) {
	return (
		<>
			<For entries={scene.selectedEdgeTargets} track="id">
				{({ item }) => (
					<path
						attr:d={item.path}
						attr:fill="none"
						attr:stroke={item.active ? scene.activeOpeningFill : scene.inactiveOpeningFill}
						attr:stroke-width={scene.openingTargetStrokeWidth}
						attr:stroke-linecap="round"
						attr:stroke-dasharray="1 10"
					/>
				)}
			</For>
			<For entries={scene.selectedResizeHandles} track="id">
				{({ item }) => (
					<circle
						attr:cx={item.cx}
						attr:cy={item.cy}
						attr:r={item.r}
						attr:fill={scene.resizeHandleFill}
						attr:stroke={scene.resizeHandleStroke}
						attr:stroke-width={scene.resizeHandleStrokeWidth}
					/>
				)}
			</For>
			<For entries={scene.selectedParameterHandles} track="id">
				{({ item }) => (
					<circle
						attr:cx={item.cx}
						attr:cy={item.cy}
						attr:r={item.r}
						attr:fill={scene.resizeHandleFill}
						attr:stroke={scene.resizeHandleStroke}
						attr:stroke-width={scene.resizeHandleStrokeWidth}
					/>
				)}
			</For>
		</>
	);
}

export function PipewareEditor2DLayers({ scene }) {
	return (
		<>
			<PipewareGridLayer scene={scene} />
			<PipewarePlacementsLayer scene={scene} />
			<If condition={scene.hasSelection}>
				{() => <PipewareOpeningTargetsLayer scene={scene} />}
			</If>
		</>
	);
}

export function PipewareEditor2DHitTargets({ scene }) {
	return (
		<>
			<For entries={scene.emptyTiles} track="id">
				{({ item }) => (
					<rect
						attr:data-editor-action="place-tile"
						attr:data-tx={item.tx}
						attr:data-ty={item.ty}
						attr:x={item.x}
						attr:y={item.y}
						attr:width={scene.tileSize}
						attr:height={scene.tileSize}
						attr:fill="transparent"
					/>
				)}
			</For>
			<For entries={scene.placementHitTargets} track="id">
				{({ item }) => (
					<path
						attr:data-editor-action="placement"
						attr:data-placement-id={item.placementId}
						attr:d={item.path}
						attr:fill="none"
						attr:stroke="transparent"
						attr:stroke-width={item.strokeWidth}
						attr:stroke-linecap="butt"
						attr:stroke-linejoin="round"
						attr:pointer-events="stroke"
					/>
				)}
			</For>
			<For entries={scene.selectedEdgeTargets} track="id">
				{({ item }) => (
					<rect
						attr:data-editor-action="edge-cut"
						attr:data-placement-id={item.placementId}
						attr:data-edge-key={item.edgeKey}
						attr:data-edge-keys={item.edgeKeys}
						attr:x={item.hit.x}
						attr:y={item.hit.y}
						attr:width={item.hit.w}
						attr:height={item.hit.h}
						attr:fill="transparent"
					/>
				)}
			</For>
			<For entries={scene.selectedResizeHandles} track="id">
				{({ item }) => (
					<rect
						attr:data-editor-action="resize"
						attr:data-placement-id={item.placementId}
						attr:data-handle-side={item.handleSide}
						attr:x={item.x}
						attr:y={item.y}
						attr:width={item.w}
						attr:height={item.h}
						attr:fill="transparent"
					/>
				)}
			</For>
			<For entries={scene.selectedParameterHandles} track="id">
				{({ item }) => (
					<rect
						attr:data-editor-action="param-handle"
						attr:data-placement-id={item.placementId}
						attr:data-param-key={item.paramKey}
						attr:data-param-side={item.paramSide}
						attr:data-param-normal-x={item.normalX}
						attr:data-param-normal-y={item.normalY}
						attr:x={item.x}
						attr:y={item.y}
						attr:width={item.w}
						attr:height={item.h}
						attr:fill="transparent"
					/>
				)}
			</For>
		</>
	);
}

export const PIPEWARE_EDITOR_2D_RENDERERS = Object.freeze({
	Layers: PipewareEditor2DLayers,
	HitTargets: PipewareEditor2DHitTargets,
});
