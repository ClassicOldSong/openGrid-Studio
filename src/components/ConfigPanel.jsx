import { If } from "refui";
import BoundSelect from "./BoundSelect.jsx";
import { ThemeSwitcher } from "./AppControls.jsx";
import {
	CHIP_BUTTON_CLASS,
	INPUT_CLASS,
	SECTION_TITLE_CLASS,
} from "../ui-styles.js";

export default function ConfigPanel({ panel }) {
	const {
		themeControls,
		classes,
		signals,
		actions,
		partOptions,
		activePartConfigSection,
	} = panel;
	const { configPanelClass, configPanelBodyClass } = classes;
	const { activePartId, isMobileLayout } = signals;
	const { closeConfigPanel, switchActivePart, clearConfiguration } = actions;

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
						<div class="grid gap-1">
							<div class={SECTION_TITLE_CLASS}>Part</div>
							<BoundSelect
								class={INPUT_CLASS}
								value={activePartId}
								on:change={(event) => switchActivePart(event.target.value)}
							>
								{partOptions.map((option) => (
									<option value={option.id}>{option.name}</option>
								))}
							</BoundSelect>
						</div>

						<If condition={activePartConfigSection}>
							{() => {
								const section =
									activePartConfigSection?.value ?? activePartConfigSection;
								const ActivePartConfigSection = section?.Component ?? null;
								return ActivePartConfigSection ? (
									<ActivePartConfigSection section={section.section} />
								) : null;
							}}
						</If>

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
