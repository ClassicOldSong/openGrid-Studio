import { $, read } from "refui";

const EDITOR_2D_RESIZE_BUTTON_RADIUS = 12;

function Editor2DResizeButton({ control, theme }) {
	const x = $(() => read(control.cx));
	const y = $(() => read(control.cy));

	return (
		<g attr:data-editor-action={control.action} style="cursor: pointer;">
			<circle
				attr:cx={x}
				attr:cy={y}
				attr:r={EDITOR_2D_RESIZE_BUTTON_RADIUS}
				attr:fill={theme.fill}
				attr:stroke={theme.stroke}
				attr:stroke-width="1.5"
			/>
			<g
				attr:stroke={theme.glyph}
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
				{control.label === "+" ? (
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
}

export default function Editor2DResizeControls({ controls, theme }) {
	return controls.map((control) => (
		<Editor2DResizeButton control={control} theme={theme} />
	));
}
