import { If } from "refui";
import { ThemeSwitcher } from "./AppControls.jsx";
import {
	CHIP_BUTTON_CLASS,
	COMPACT_INPUT_CLASS,
	FIELD_LABEL_CLASS,
	FORM_LABEL_CLASS,
	INPUT_CLASS,
	SECTION_CLASS,
	SECTION_TITLE_CLASS,
	TOGGLE_LABEL_CLASS,
} from "../ui-styles.js";

export default function ConfigPanel({ panel }) {
	const { themeControls, classes, constants, signals, actions } = panel;
	const { configPanelClass, configPanelBodyClass } = classes;
	const {
		BOARD_DIMENSION_MIN,
		TOP_COLUMN_MIN,
		STACK_COUNT_MIN,
		TILE_SIZE_MIN,
		MEASUREMENT_MIN,
		POSITIVE_MEASUREMENT_MIN,
		SEGMENTS_MIN,
		COUNTERSINK_DEGREE_MIN,
	} = constants;
	const {
		isMobileLayout,
		width,
		height,
		top1Text,
		top2Text,
		fullOrLite,
		stackCountValue,
		stackingMethod,
		interfaceThicknessValue,
		interfaceSeparationValue,
		screwDiameterValue,
		screwHeadDiameterValue,
		screwHeadInsetValue,
		screwHeadCountersunkDegreeValue,
		screwHeadIsCountersunk,
		backsideScrewHole,
		backsideScrewHeadDiameterShrinkValue,
		backsideScrewHeadInsetValue,
		backsideScrewHeadIsCountersunk,
		adhesiveBaseThicknessValue,
		addAdhesiveBase,
		tileSizeValue,
		tileThicknessValue,
		liteTileThicknessValue,
		heavyTileThicknessValue,
		heavyTileGapValue,
		circleSegmentsValue,
	} = signals;
	const {
		closeConfigPanel,
		updateSize,
		clampIntegerInput,
		clampNumberInput,
		applyTrapezoid,
		applyHelper,
		clearConfiguration,
	} = actions;

	return (
		<div class={configPanelClass}>
			<div class={configPanelBodyClass}>
				<div>
					<div class="mb-4 sm:mb-6 flex items-center justify-between gap-3">
						<h2 class="text-lg sm:text-xl font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2">
							<div class="w-2 h-5 sm:h-6 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
							Configuration
						</h2>
						<If condition={isMobileLayout}>
							{() => (
								<button
									class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
									on:click={closeConfigPanel}
									aria-label="Close configuration"
								>
									<svg
										aria-hidden="true"
										viewBox="0 0 20 20"
										class="h-5 w-5 fill-none stroke-current"
										stroke-width="1.8"
										stroke-linecap="round"
									>
										<path d="M5.5 5.5l9 9" />
										<path d="M14.5 5.5l-9 9" />
									</svg>
								</button>
							)}
						</If>
					</div>

					<div class="grid gap-6">
						<If condition={isMobileLayout}>
							{() => <ThemeSwitcher mobile controls={themeControls} />}
						</If>
						<div class="grid gap-4">
							<div class={SECTION_TITLE_CLASS}>Shape Helpers</div>
							<div class="grid grid-cols-2 gap-3">
								<div class="grid gap-1">
									<label class={FORM_LABEL_CLASS}>Width</label>
									<input
										type="number"
										class={INPUT_CLASS}
										min={BOARD_DIMENSION_MIN}
										value={width}
										on:input={(e) =>
											updateSize(
												clampIntegerInput(
													e.target.value,
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
										on:input={(e) =>
											updateSize(
												width.value,
												clampIntegerInput(
													e.target.value,
													BOARD_DIMENSION_MIN,
													Infinity,
													height.value,
												),
											)
										}
									/>
								</div>
							</div>
							<div class="grid grid-cols-2 gap-3">
								<div class="grid gap-1">
									<label class={FORM_LABEL_CLASS}>Top col 1</label>
									<input
										type="number"
										class={INPUT_CLASS}
										min={TOP_COLUMN_MIN}
										max={width}
										value={top1Text}
										on:input={(e) =>
											(top1Text.value = String(
												clampIntegerInput(
													e.target.value,
													TOP_COLUMN_MIN,
													width.value,
													Number(top1Text.value) || TOP_COLUMN_MIN,
												),
											))
										}
									/>
								</div>
								<div class="grid gap-1">
									<label class={FORM_LABEL_CLASS}>Top col 2</label>
									<input
										type="number"
										class={INPUT_CLASS}
										min={TOP_COLUMN_MIN}
										max={width}
										value={top2Text}
										on:input={(e) =>
											(top2Text.value = String(
												clampIntegerInput(
													e.target.value,
													TOP_COLUMN_MIN,
													width.value,
													Number(top2Text.value) || TOP_COLUMN_MIN,
												),
											))
										}
									/>
								</div>
								<button
									class="bg-blue-600 border border-blue-600 text-white rounded-lg h-9 px-4 text-sm font-semibold hover:bg-blue-700 transition col-span-2 dark:bg-blue-500 dark:border-blue-500 dark:hover:bg-blue-400"
									on:click={applyTrapezoid}
								>
									Apply
								</button>
							</div>
						</div>

						<div class={SECTION_CLASS}>
							<div class={SECTION_TITLE_CLASS}>Presets</div>
							<div class="flex flex-wrap gap-2">
								{[
									{ label: "Screws", mode: "holes_all" },
									{ label: "Connectors", mode: "connectors_edge" },
									{ label: "Chamfers", mode: "chamfer_all" },
									{ label: "Clear", mode: "clear_all" },
								].map(({ label, mode }) => (
									<button
										class={CHIP_BUTTON_CLASS}
										on:click={() => applyHelper(mode)}
									>
										{label}
									</button>
								))}
							</div>
						</div>

						<div class={SECTION_CLASS}>
							<div class={SECTION_TITLE_CLASS}>Board Type</div>
							<div class="flex gap-4">
								{["Full", "Lite", "Heavy"].map((v) => (
									<label class="flex items-center gap-2 cursor-pointer group">
										<input
											type="radio"
											class="w-4 h-4 text-blue-600 focus:ring-blue-500/20 border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:focus:ring-blue-400/20"
											checked={fullOrLite.eq(v)}
											on:change={() => (fullOrLite.value = v)}
										/>
										<span class="text-sm font-medium text-gray-600 group-hover:text-blue-600 transition dark:text-slate-300 dark:group-hover:text-blue-300">
											{v}
										</span>
									</label>
								))}
							</div>
						</div>

						<div class={SECTION_CLASS}>
							<div class={SECTION_TITLE_CLASS}>Stacking</div>
							<div class="grid grid-cols-2 gap-x-4 gap-y-3">
								<div class="grid gap-1">
									<label class={FIELD_LABEL_CLASS}>Stack Count</label>
									<input
										type="number"
										class={COMPACT_INPUT_CLASS}
										min={STACK_COUNT_MIN}
										value={stackCountValue}
										on:input={(e) =>
											(stackCountValue.value = clampIntegerInput(
												e.target.value,
												STACK_COUNT_MIN,
												Infinity,
												stackCountValue.value,
											))
										}
									/>
								</div>
								<div class="grid gap-1">
									<label class={FIELD_LABEL_CLASS}>Method</label>
									<select
										class={COMPACT_INPUT_CLASS}
										value={stackingMethod}
										on:change={(e) => (stackingMethod.value = e.target.value)}
									>
										<option value="Interface Layer">Interface Layer</option>
										<option value="Ironing - BETA">Ironing - BETA</option>
									</select>
								</div>
								<div class="grid gap-1">
									<label class={FIELD_LABEL_CLASS}>Interface Thickness</label>
									<input
										type="number"
										class={COMPACT_INPUT_CLASS}
										step={0.1}
										min={MEASUREMENT_MIN}
										value={interfaceThicknessValue}
										on:input={(e) =>
											(interfaceThicknessValue.value = clampNumberInput(
												e.target.value,
												MEASUREMENT_MIN,
												Infinity,
												interfaceThicknessValue.value,
											))
										}
									/>
								</div>
								<div class="grid gap-1">
									<label class={FIELD_LABEL_CLASS}>Separation</label>
									<input
										type="number"
										class={COMPACT_INPUT_CLASS}
										step={0.1}
										min={MEASUREMENT_MIN}
										value={interfaceSeparationValue}
										on:input={(e) =>
											(interfaceSeparationValue.value = clampNumberInput(
												e.target.value,
												MEASUREMENT_MIN,
												Infinity,
												interfaceSeparationValue.value,
											))
										}
									/>
								</div>
							</div>
						</div>

						<div class={SECTION_CLASS}>
							<div class={SECTION_TITLE_CLASS}>Screws</div>
							<div class="grid grid-cols-2 gap-x-4 gap-y-3">
								{[
									{
										label: "Screw Diameter",
										step: 0.1,
										sig: screwDiameterValue,
										min: POSITIVE_MEASUREMENT_MIN,
									},
									{
										label: "Head Diameter",
										step: 0.1,
										sig: screwHeadDiameterValue,
										min: POSITIVE_MEASUREMENT_MIN,
									},
									{
										label: "Head Inset",
										step: 0.1,
										sig: screwHeadInsetValue,
										min: MEASUREMENT_MIN,
									},
									{
										label: "Sink Deg",
										step: 0.1,
										sig: screwHeadCountersunkDegreeValue,
										min: COUNTERSINK_DEGREE_MIN,
									},
								].map(({ label, sig, step, min, max }) => (
									<div class="grid gap-1">
										<label class={FIELD_LABEL_CLASS}>{label}</label>
										<input
											type="number"
											class={COMPACT_INPUT_CLASS}
											step={step}
											min={min}
											value={sig}
											on:input={(e) =>
												(sig.value = clampNumberInput(
													e.target.value,
													min,
													max ?? Infinity,
													sig.value,
												))
											}
										/>
									</div>
								))}
							</div>
							<label class={TOGGLE_LABEL_CLASS}>
								<input
									type="checkbox"
									class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:focus:ring-blue-400/20"
									checked={screwHeadIsCountersunk}
									on:change={(e) =>
										(screwHeadIsCountersunk.value = e.target.checked)
									}
								/>
								Countersunk
							</label>
						</div>

						<If condition={fullOrLite.eq("Full")}>
							{() => (
								<div class={SECTION_CLASS}>
									<div class={SECTION_TITLE_CLASS}>Backside Screws</div>
									<label class={TOGGLE_LABEL_CLASS}>
										<input
											type="checkbox"
											class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:focus:ring-blue-400/20"
											checked={backsideScrewHole}
											on:change={(e) =>
												(backsideScrewHole.value = e.target.checked)
											}
										/>
										Enable backside
									</label>
									<div class="grid grid-cols-2 gap-x-4 gap-y-3">
										{[
											{
												label: "Head Shrink",
												step: 0.1,
												sig: backsideScrewHeadDiameterShrinkValue,
												min: MEASUREMENT_MIN,
											},
											{
												label: "Head Inset",
												step: 0.1,
												sig: backsideScrewHeadInsetValue,
												min: MEASUREMENT_MIN,
											},
										].map(({ label, sig, step, min, max }) => (
											<div class="grid gap-1">
												<label class={FIELD_LABEL_CLASS}>{label}</label>
												<input
													type="number"
													class={COMPACT_INPUT_CLASS}
													step={step}
													min={min}
													value={sig}
													on:input={(e) =>
														(sig.value = clampNumberInput(
															e.target.value,
															min,
															max ?? Infinity,
															sig.value,
														))
													}
												/>
											</div>
										))}
									</div>
									<label class={TOGGLE_LABEL_CLASS}>
										<input
											type="checkbox"
											class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:focus:ring-blue-400/20"
											checked={backsideScrewHeadIsCountersunk}
											on:change={(e) =>
												(backsideScrewHeadIsCountersunk.value =
													e.target.checked)
											}
										/>
										Backside countersunk
									</label>
								</div>
							)}
						</If>

						<If condition={fullOrLite.eq("Lite")}>
							{() => (
								<div class={SECTION_CLASS}>
									<div class={SECTION_TITLE_CLASS}>Adhesive Base</div>
									<label class={TOGGLE_LABEL_CLASS}>
										<input
											type="checkbox"
											class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:focus:ring-blue-400/20"
											checked={addAdhesiveBase}
											on:change={(e) =>
												(addAdhesiveBase.value = e.target.checked)
											}
										/>
										Enable base
									</label>
									<div class="grid gap-1">
										<label class={FIELD_LABEL_CLASS}>Thickness</label>
										<input
											type="number"
											class={COMPACT_INPUT_CLASS}
											min={MEASUREMENT_MIN}
											value={adhesiveBaseThicknessValue}
											on:input={(e) =>
												(adhesiveBaseThicknessValue.value =
													clampNumberInput(
														e.target.value,
														MEASUREMENT_MIN,
														Infinity,
														adhesiveBaseThicknessValue.value,
													))
											}
										/>
									</div>
								</div>
							)}
						</If>

						<div class={SECTION_CLASS}>
							<div class={SECTION_TITLE_CLASS}>Dimensions</div>
							<div class="grid grid-cols-2 gap-x-4 gap-y-3">
								{[
									{
										label: "Tile Size",
										step: 1,
										sig: tileSizeValue,
										min: TILE_SIZE_MIN,
										integer: true,
									},
									{
										label: "Thickness",
										type: "Full",
										step: 0.1,
										sig: tileThicknessValue,
										min: POSITIVE_MEASUREMENT_MIN,
									},
									{
										label: "Lite Thickness",
										type: "Lite",
										step: 0.1,
										sig: liteTileThicknessValue,
										min: POSITIVE_MEASUREMENT_MIN,
									},
									{
										label: "Heavy Thickness",
										type: "Heavy",
										step: 0.1,
										sig: heavyTileThicknessValue,
										min: POSITIVE_MEASUREMENT_MIN,
									},
									{
										label: "Heavy Gap",
										type: "Heavy",
										step: 0.1,
										sig: heavyTileGapValue,
										min: MEASUREMENT_MIN,
									},
								].map(({ label, type, sig, step, min, max, integer }) => (
									<If condition={() => (type ? fullOrLite.value === type : true)}>
										{() => (
											<div class="grid gap-1">
												<label class={FIELD_LABEL_CLASS}>{label}</label>
												<input
													type="number"
													class={COMPACT_INPUT_CLASS}
													step={step}
													min={min}
													value={sig}
													on:input={(e) =>
														(sig.value = integer
															? clampIntegerInput(
																	e.target.value,
																	min,
																	max ?? Infinity,
																	sig.value,
															  )
															: clampNumberInput(
																	e.target.value,
																	min,
																	max ?? Infinity,
																	sig.value,
															  ))
													}
												/>
											</div>
										)}
									</If>
								))}
							</div>
						</div>

						<div class={SECTION_CLASS}>
							<div class={SECTION_TITLE_CLASS}>Quality</div>
							<div class="grid grid-cols-2 gap-x-4 gap-y-3">
								<div class="grid gap-1">
									<label class={FIELD_LABEL_CLASS}>Segments</label>
									<input
										type="number"
										class={COMPACT_INPUT_CLASS}
										min={SEGMENTS_MIN}
										value={circleSegmentsValue}
										on:input={(e) =>
											(circleSegmentsValue.value = clampIntegerInput(
												e.target.value,
												SEGMENTS_MIN,
												Infinity,
												circleSegmentsValue.value,
											))
										}
									/>
								</div>
							</div>
						</div>

						<div class="grid gap-3 border-t border-gray-200 pt-4 dark:border-slate-800">
							<button class={CHIP_BUTTON_CLASS} on:click={clearConfiguration}>
								Clear Saved Config
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
