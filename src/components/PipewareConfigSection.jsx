import { $, For, If } from "refui";
import {
	PIPEWARE_FEATURE_OPTIONS,
	PIPEWARE_PARAM_FIELDS,
	PIPEWARE_PARAM_LIMITS,
} from "../parts/pipeware/constants.js";
import {
	COMPACT_INPUT_CLASS,
	FIELD_LABEL_CLASS,
	FORM_LABEL_CLASS,
	INPUT_CLASS,
	SECTION_CLASS,
	SECTION_TITLE_CLASS,
} from "../ui-styles.js";

export default function PipewareConfigSection({ section }) {
	const { constants, signals, actions } = section;
	const { BOARD_DIMENSION_MIN, TILE_SIZE_MIN, THICKNESS_MIN, SEGMENTS_MIN } =
		constants;
	const {
		width,
		height,
		tileSizeValue,
		pipewareBoardThicknessValue,
		circleSegmentsValue,
		pipewareActiveFeatureConfig,
		pipewareSelectedPlacement,
		pipewareSelectedPlacementLabel,
	} = signals;
	const {
		updateSize,
		clampIntegerInput,
		clampNumberInput,
		setPipewareFeatureType,
		updatePipewareFeatureParam,
		removeSelectedPipewarePlacement,
	} = actions;
	const currentFeatureType = $(() => {
		const activeConfig = pipewareActiveFeatureConfig.value;
		const selectedPlacement = pipewareSelectedPlacement.value;
		return selectedPlacement ? selectedPlacement.type : activeConfig.type;
	});
	const currentFeatureParams = $(() => {
		const activeConfig = pipewareActiveFeatureConfig.value;
		const selectedPlacement = pipewareSelectedPlacement.value;
		return selectedPlacement ? selectedPlacement.params : activeConfig.params;
	});
	const hasSelectedPlacement = $(() => !!pipewareSelectedPlacement.value);
	const currentFeatureFields = $(
		() => PIPEWARE_PARAM_FIELDS[currentFeatureType.value] ?? PIPEWARE_PARAM_FIELDS.I,
	);

	return (
		<>
			<div class="grid gap-4">
				<div class={SECTION_TITLE_CLASS}>Board Size</div>
				<div class="grid grid-cols-2 gap-3">
					<div class="grid gap-1">
						<label class={FORM_LABEL_CLASS}>Width</label>
						<input
							type="number"
							class={INPUT_CLASS}
							min={BOARD_DIMENSION_MIN}
							value={width}
							on:input={(event) =>
								updateSize(
									clampIntegerInput(
										event.target.value,
										BOARD_DIMENSION_MIN,
										Infinity,
										width.value,
									),
									height.value,
								)
							}
						/>
					</div>
					<div class="grid gap-1">
						<label class={FORM_LABEL_CLASS}>Height</label>
						<input
							type="number"
							class={INPUT_CLASS}
							min={BOARD_DIMENSION_MIN}
							value={height}
							on:input={(event) =>
								updateSize(
									width.value,
									clampIntegerInput(
										event.target.value,
										BOARD_DIMENSION_MIN,
										Infinity,
										height.value,
									),
								)
							}
						/>
					</div>
					<div class="grid gap-1">
						<label class={FORM_LABEL_CLASS}>Board Inner Height</label>
						<input
							type="number"
							class={INPUT_CLASS}
							step="0.1"
							min={THICKNESS_MIN}
							value={pipewareBoardThicknessValue}
							on:input={(event) =>
								(pipewareBoardThicknessValue.value = clampNumberInput(
									event.target.value,
									THICKNESS_MIN,
									Infinity,
									pipewareBoardThicknessValue.value,
								))
							}
						/>
					</div>
				</div>
			</div>

			<div class={SECTION_CLASS}>
				<div class={SECTION_TITLE_CLASS}>Part Selection</div>
				<div class="grid grid-cols-2 gap-2">
					{PIPEWARE_FEATURE_OPTIONS.map((option) => (
						<button
							class={$(() =>
								[
									"rounded-lg py-1.5 px-3 text-[10px] font-bold uppercase tracking-tight transition",
									currentFeatureType.value === option.value
										? "bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400"
										: "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
								].join(" "),
							)}
							on:click={() => setPipewareFeatureType(option.value)}
						>
							{option.label}
						</button>
					))}
				</div>
				<If condition={hasSelectedPlacement}>
					{() => (
						<div class="text-sm font-semibold text-gray-700 dark:text-slate-200">
							{pipewareSelectedPlacementLabel}
						</div>
					)}
				</If>
				<div class="grid gap-3">
					<div class="grid grid-cols-2 gap-3">
						<For entries={currentFeatureFields} track="key">
							{({ item }) => {
								const value = $(
									() =>
										currentFeatureParams.value?.[item.key] ??
										PIPEWARE_PARAM_LIMITS[currentFeatureType.value]?.[item.key]
											?.min ??
										0,
								);
								const min = $(
									() =>
										PIPEWARE_PARAM_LIMITS[currentFeatureType.value]?.[item.key]
											?.min ?? 0,
								);
								const max = $(
									() =>
										PIPEWARE_PARAM_LIMITS[currentFeatureType.value]?.[item.key]
											?.max ?? undefined,
								);
								return (
									<div class="grid gap-1">
										<label class={FIELD_LABEL_CLASS}>{item.label}</label>
										<input
											type="number"
											class={COMPACT_INPUT_CLASS}
											min={min}
											max={max}
											step={item.step ?? 1}
											value={value}
											on:input={(event) =>
												updatePipewareFeatureParam(
													item.key,
													event.target.value,
												)
											}
										/>
									</div>
								);
							}}
						</For>
					</div>
				</div>
				<If condition={hasSelectedPlacement}>
					{() => (
						<button
							class="bg-rose-50 text-rose-700 rounded-lg h-9 px-4 text-sm font-semibold hover:bg-rose-100 transition dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/40"
							on:click={removeSelectedPipewarePlacement}
						>
							Remove Placement
						</button>
					)}
				</If>
				<p class="text-xs leading-relaxed text-gray-500 dark:text-slate-400">
					Tap an empty tile to place this config. Selecting a placed part copies
					its config here for future placements. Tap the selected part again to
					rotate it. Right click/long press to remove a part.
				</p>
			</div>

			<div class={SECTION_CLASS}>
				<div class={SECTION_TITLE_CLASS}>Dimensions & Quality</div>
				<div class="grid grid-cols-2 gap-3">
					<div class="grid gap-1">
						<label class={FIELD_LABEL_CLASS}>Tile Size</label>
						<input
							type="number"
							class={COMPACT_INPUT_CLASS}
							step="0.1"
							min={TILE_SIZE_MIN}
							value={tileSizeValue}
							on:input={(event) =>
								(tileSizeValue.value = clampNumberInput(
									event.target.value,
									TILE_SIZE_MIN,
									Infinity,
									tileSizeValue.value,
								))
							}
						/>
					</div>
					<div class="grid gap-1">
						<label class={FIELD_LABEL_CLASS}>Segments</label>
						<input
							type="number"
							class={COMPACT_INPUT_CLASS}
							min={SEGMENTS_MIN}
							value={circleSegmentsValue}
							on:input={(event) =>
								(circleSegmentsValue.value = clampIntegerInput(
									event.target.value,
									SEGMENTS_MIN,
									Infinity,
									circleSegmentsValue.value,
								))
							}
						/>
					</div>
				</div>
			</div>
		</>
	);
}
