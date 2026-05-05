import { $ } from "refui";
import {
	COMPACT_INPUT_CLASS,
	FIELD_LABEL_CLASS,
	FORM_LABEL_CLASS,
	SECTION_CLASS,
	SECTION_TITLE_CLASS,
} from "../../ui-styles.js";

export default function PicaRailConfigSection({ section }) {
	const { constants, signals, actions } = section;
	const { MEASUREMENT_MIN } = constants;
	const {
		openGridTileSizeValue,
		openGridTileLength,
		targetLength,
		picaTileCount,
		endExtension,
		picaRailLength,
		picaTileOffset,
	} = signals;
	const { clampIntegerInput, clampNumberInput } = actions;

	const targetLengthText = $(() => targetLength.value.toFixed(2));
	const extensionText = $(() => endExtension.value.toFixed(2));
	const tilePitchText = $(() => picaTileOffset.value.toFixed(3));
	const finalLengthText = $(() => picaRailLength.value.toFixed(2));
	const tileCountText = $(() => String(Math.max(0, Math.round(picaTileCount.value))));

	return (
		<div class="grid gap-4">
			<div class={SECTION_TITLE_CLASS}>Rail Profile</div>
			<div class="grid grid-cols-2 gap-3">
				<div class="grid gap-1">
					<label class={FORM_LABEL_CLASS}>OpenGrid Tile Size (mm)</label>
					<input
						type="number"
						class={COMPACT_INPUT_CLASS}
						step="0.1"
						min={MEASUREMENT_MIN}
						value={openGridTileSizeValue}
						on:input={(event) =>
							(openGridTileSizeValue.value = clampNumberInput(
								event.target.value,
								MEASUREMENT_MIN,
								Infinity,
								openGridTileSizeValue.value,
							))
						}
					/>
				</div>
				<div class="grid gap-1">
					<label class={FORM_LABEL_CLASS}>OpenGrid Tile Length</label>
					<input
						type="number"
						class={COMPACT_INPUT_CLASS}
						step="1"
						min={1}
						value={openGridTileLength}
						on:input={(event) =>
							(openGridTileLength.value = clampIntegerInput(
								event.target.value,
								1,
								Infinity,
								openGridTileLength.value,
							))
						}
					/>
				</div>
			</div>
			<div class={SECTION_CLASS}>
				<div class="grid gap-1">
					<label class={FIELD_LABEL_CLASS}>OpenGrid Target Length</label>
					<div class="text-xs text-gray-500">{targetLengthText} mm</div>
				</div>
				<div class="grid gap-1">
					<label class={FIELD_LABEL_CLASS}>Effective Rail Length</label>
					<div class="text-xs text-gray-500">{finalLengthText} mm</div>
				</div>
				<div class="grid gap-1">
					<label class={FIELD_LABEL_CLASS}>Tile Count / Slot Count</label>
					<div class="text-xs text-gray-500">{tileCountText}</div>
				</div>
				<div class="grid gap-1">
					<label class={FIELD_LABEL_CLASS}>End Extension</label>
					<div class="text-xs text-gray-500">{extensionText} mm</div>
				</div>
				<div class="grid gap-1">
					<label class={FIELD_LABEL_CLASS}>Slot Side Width</label>
					<div class="text-xs text-gray-500">{tilePitchText} mm</div>
				</div>
			</div>
		</div>
	);
}
