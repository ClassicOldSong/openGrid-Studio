import { $ } from "refui";
import {
	COMPACT_INPUT_CLASS,
	FIELD_LABEL_CLASS,
	FORM_LABEL_CLASS,
	SECTION_CLASS,
	SECTION_TITLE_CLASS,
	TOGGLE_LABEL_CLASS,
} from "../../ui-styles.js";

export default function PicaRailConfigSection({ section }) {
	const { constants, signals, actions } = section;
	const { MEASUREMENT_MIN } = constants;
	const {
		openGridTileSizeValue,
		openGridTileLength,
		extendEnds,
		picaTileCount,
		picaRailLength,
		screwHoleSegmentsValue,
	} = signals;
	const { clampIntegerInput, clampNumberInput } = actions;

	const finalLengthText = $(() => picaRailLength.value.toFixed(2));
	const slotCountText = $(() => String(Math.max(0, Math.round(picaTileCount.value))));

	return (
		<div class="grid gap-4">
			<div class={SECTION_TITLE_CLASS}>Rail Profile</div>
			<div class="grid gap-3">
				<div class="grid gap-1">
					<label class={FORM_LABEL_CLASS}>openGrid Tile Length</label>
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
				<label class={TOGGLE_LABEL_CLASS}>
					<input
						type="checkbox"
						class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:focus:ring-blue-400/20"
						checked={extendEnds}
						on:change={(event) => (extendEnds.value = event.target.checked)}
					/>
					Extend ends
				</label>
			</div>
			<div class={SECTION_CLASS}>
				<div class={SECTION_TITLE_CLASS}>Dimensions & Quality</div>
				<div class="grid grid-cols-2 gap-3">
					<div class="grid gap-1">
						<label class={FIELD_LABEL_CLASS}>OpenGrid Tile Size (mm)</label>
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
						<label class={FIELD_LABEL_CLASS}>Screw Hole Segments</label>
						<input
							type="number"
							class={COMPACT_INPUT_CLASS}
							step="1"
							min={12}
							max={360}
							value={screwHoleSegmentsValue}
							on:input={(event) =>
								(screwHoleSegmentsValue.value = clampIntegerInput(
									event.target.value,
									12,
									360,
									screwHoleSegmentsValue.value,
								))
							}
						/>
					</div>
				</div>
			</div>
			<div class={SECTION_CLASS}>
				<div class="grid gap-1">
					<label class={FIELD_LABEL_CLASS}>Effective Rail Length</label>
					<div class="text-xs text-gray-500">{finalLengthText} mm</div>
				</div>
				<div class="grid gap-1">
					<label class={FIELD_LABEL_CLASS}>Slot Count</label>
					<div class="text-xs text-gray-500">{slotCountText}</div>
				</div>
			</div>
		</div>
	);
}
