import Editor2DResizeControls from "./Editor2DResizeControls.jsx";

export default function Editor2DSvgScene({ editor, navigation }) {
	if (!editor) return null;

	const Defs = editor.renderers?.Defs;
	const Layers = editor.renderers?.Layers;
	const HitTargets = editor.renderers?.HitTargets;
	const resizeControls = editor.sharedControls?.resize;

	return (
		<>
			{Defs ? <defs><Defs scene={editor.scene} /></defs> : null}
			<g attr:transform={navigation.sceneTransform}>
				{Layers ? <Layers scene={editor.scene} /> : null}
				{HitTargets ? <HitTargets scene={editor.scene} /> : null}
				{resizeControls?.controls?.length ? (
					<Editor2DResizeControls
						controls={resizeControls.controls}
						theme={resizeControls.theme}
					/>
				) : null}
			</g>
		</>
	);
}
