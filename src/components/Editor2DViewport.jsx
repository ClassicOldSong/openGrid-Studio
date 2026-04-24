import { If } from "refui";
import { createEditor2DNavigation } from "./editor2d-navigation.js";
import Editor2DSvgScene from "./Editor2DSvgScene.jsx";

export default function Editor2DViewport({ viewport, editor }) {
	const navigation = createEditor2DNavigation({
		sceneWidth: viewport.sceneWidth,
		sceneHeight: viewport.sceneHeight,
		baseTileSize: viewport.baseTileSize,
		isWebKitEngine: viewport.isWebKitEngine,
		readAction: editor.actions.readAction,
		performAction: editor.actions.performAction,
	});

	return (
		<div class="flex-1 min-h-0 relative overflow-hidden bg-white dark:bg-slate-950">
			<div class="absolute inset-0" style={viewport.backgroundStyle}></div>
			<div class={viewport.viewportClass} style={viewport.viewportStyle}>
				<div
					class="absolute inset-0 cursor-grab select-none"
					style="touch-action: none;"
					$ref={navigation.attachViewport}
					on:contextmenu={(event) => event.preventDefault()}
					on:pointerdown={navigation.onPointerDown}
					on:pointermove={navigation.onPointerMove}
					on:pointerup={navigation.onPointerFinish}
					on:pointercancel={navigation.onPointerFinish}
					on:wheel={navigation.onWheel}
				>
					<svg
						attr:viewBox={navigation.svgViewBox}
						attr:preserveAspectRatio={navigation.svgPreserveAspectRatio}
						attr:width={navigation.svgWidth}
						attr:height={navigation.svgHeight}
						class={navigation.svgClass}
						style={navigation.svgStyle}
					><Editor2DSvgScene editor={editor} navigation={navigation} /></svg>
				</div>
			</div>
			<If condition={navigation.showHint}>
				{() => (
					<div class={editor.viewport.hintClass}>{editor.viewport.hintText}</div>
				)}
			</If>
		</div>
	);
}
