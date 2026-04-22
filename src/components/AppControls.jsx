import { $ } from "refui";
import {
	EXPORT_MENU_ABOVE_CLASS,
	EXPORT_MENU_CLASS,
	MOBILE_THEME_BAR_CLASS,
	PREVIEW_BAR_CLASS,
	SECTION_CLASS,
	SECTION_TITLE_CLASS,
	THEME_BAR_CLASS,
} from "../ui-styles.js";

export function ThemeSwitcher({ mobile = false, controls }) {
	const { themeOptionClass, themeMode } = controls;

	return (
		<div class={mobile ? `grid gap-3 ${SECTION_CLASS}` : "inline-flex"}>
			{mobile ? <div class={SECTION_TITLE_CLASS}>Appearance</div> : null}
			<div class={mobile ? MOBILE_THEME_BAR_CLASS : THEME_BAR_CLASS}>
				<button
					class={
						mobile
							? $(() => `${themeOptionClass("auto").value} w-full justify-center`)
							: themeOptionClass("auto")
					}
					on:click={() => (themeMode.value = "auto")}
				>
					Auto
				</button>
				<button
					class={
						mobile
							? $(() =>
									`${themeOptionClass("light").value} w-full justify-center`,
							  )
							: themeOptionClass("light")
					}
					on:click={() => (themeMode.value = "light")}
				>
					Light
				</button>
				<button
					class={
						mobile
							? $(() => `${themeOptionClass("dark").value} w-full justify-center`)
							: themeOptionClass("dark")
					}
					on:click={() => (themeMode.value = "dark")}
				>
					Dark
				</button>
			</div>
		</div>
	);
}

export function DownloadActions({ mobile = false, controls }) {
	const {
		mobileFloatingRightStyle,
		exportButtonClass,
		downloadExport,
		exportInFlight,
		exportFormatLabel,
		exportDropdownButtonClass,
		exportMenuItemClass,
		openCopyScadFromMenu,
		chooseExportFormat,
		exportFormatOptions,
	} = controls;

	return (
		<div
			class={mobile ? "fixed z-30 flex items-stretch" : "relative flex items-stretch"}
			style={mobile ? mobileFloatingRightStyle : undefined}
		>
			<button
				class={exportButtonClass}
				on:click={downloadExport}
				prop:disabled={exportInFlight}
			>
				{$(() =>
					exportInFlight.value
						? `Rendering ${exportFormatLabel.value}...`
						: `Download ${exportFormatLabel.value}`,
				)}
			</button>
			<details class="js-export-menu relative">
				<summary class={exportDropdownButtonClass} style="list-style: none;">
					<svg
						aria-hidden="true"
						viewBox="0 0 16 16"
						class="h-4 w-4 fill-current"
					>
						<path d="M4.22 6.97a.75.75 0 0 1 1.06 0L8 9.69l2.72-2.72a.75.75 0 1 1 1.06 1.06L8.53 11.28a.75.75 0 0 1-1.06 0L4.22 8.03a.75.75 0 0 1 0-1.06Z" />
					</svg>
				</summary>
				<div class={mobile ? EXPORT_MENU_ABOVE_CLASS : EXPORT_MENU_CLASS}>
					<button
						class={exportMenuItemClass("__copy_scad__")}
						on:click={openCopyScadFromMenu}
					>
						Copy SCAD
					</button>
					{exportFormatOptions.map((option) => (
						<button
							class={exportMenuItemClass(option.value)}
							on:click={(event) => chooseExportFormat(option.value, event)}
						>
							{option.label}
						</button>
					))}
				</div>
			</details>
		</div>
	);
}

export function PreviewModeSwitcher({ mobile = false, controls }) {
	const { mobileFloatingLeftStyle, previewOptionClass, previewMode } = controls;

	return (
		<div
			class={mobile ? "pointer-events-auto fixed z-30" : "block"}
			style={mobile ? mobileFloatingLeftStyle : undefined}
		>
			<div class={PREVIEW_BAR_CLASS}>
				<button
					class={previewOptionClass("2d")}
					on:click={() => (previewMode.value = "2d")}
				>
					2D
				</button>
				<button
					class={previewOptionClass("3d")}
					on:click={() => (previewMode.value = "3d")}
				>
					3D
				</button>
			</div>
		</div>
	);
}
