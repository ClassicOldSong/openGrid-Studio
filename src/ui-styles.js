import { $ } from "refui";

export const INPUT_CLASS =
	"border border-gray-200 rounded-lg h-9 px-3 text-sm text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-400/20";
export const COMPACT_INPUT_CLASS =
	"border border-gray-200 rounded-lg h-8 px-2 text-xs text-gray-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none bg-white transition w-full dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-400/20";
export const SECTION_CLASS =
	"grid gap-4 border-t border-gray-200 pt-6 dark:border-slate-800";
export const SECTION_TITLE_CLASS =
	"text-[10px] font-bold uppercase tracking-widest text-blue-600/70 dark:text-blue-300/80";
export const FIELD_LABEL_CLASS =
	"text-[10px] font-bold text-gray-400 uppercase tracking-tighter dark:text-slate-500";
export const FORM_LABEL_CLASS =
	"text-xs font-medium text-gray-500 dark:text-slate-400";
export const TOGGLE_LABEL_CLASS =
	"flex items-center gap-2 text-sm font-medium text-gray-600 cursor-pointer dark:text-slate-300";
export const CHIP_BUTTON_CLASS =
	"bg-gray-100 text-gray-600 rounded-lg py-1.5 px-3 text-[10px] font-bold uppercase hover:bg-gray-200 transition tracking-tight dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";
export const ABOUT_BUTTON_CLASS =
	"h-10 pr-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition flex items-center dark:text-slate-400 dark:hover:text-slate-200";
export const PRIMARY_BUTTON_CLASS =
	"bg-blue-600 text-white rounded-xl h-10 px-4 text-sm font-bold hover:bg-blue-700 transition flex items-center gap-2 shadow-lg shadow-blue-600/20 dark:bg-blue-500 dark:hover:bg-blue-400";
export const MODAL_ACTION_CLASS =
	"bg-gray-100 text-gray-700 rounded-xl px-4 h-11 font-bold hover:bg-gray-200 transition dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700";
export const MODAL_PRIMARY_ACTION_CLASS =
	"bg-blue-600 text-white rounded-xl px-4 h-11 font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20 dark:bg-blue-500 dark:hover:bg-blue-400";
export const THEME_BAR_CLASS =
	"inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 h-10 dark:border-slate-700 dark:bg-slate-900";
export const MOBILE_THEME_BAR_CLASS =
	"grid h-auto grid-cols-3 rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-slate-700 dark:bg-slate-900";
export const PREVIEW_BAR_CLASS =
	"inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 h-10 dark:border-slate-700 dark:bg-slate-900";
export const EXPORT_MENU_CLASS =
	"absolute right-0 top-full z-30 mt-2 min-w-40 rounded-xl border border-gray-200 bg-white p-1 shadow-[0_12px_30px_rgba(15,23,42,0.14)] dark:border-slate-700 dark:bg-slate-900";
export const EXPORT_MENU_ABOVE_CLASS =
	"absolute bottom-full right-0 z-30 mb-2 min-w-40 rounded-xl border border-gray-200 bg-white p-1 shadow-[0_12px_30px_rgba(15,23,42,0.14)] dark:border-slate-700 dark:bg-slate-900";
export const MOBILE_FLOATING_BOTTOM_STYLE =
	"bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem);";
export const MOBILE_FLOATING_LEFT_STYLE =
	`${MOBILE_FLOATING_BOTTOM_STYLE} left: calc(env(safe-area-inset-left, 0px) + 1rem);`;
export const MOBILE_FLOATING_RIGHT_STYLE =
	`${MOBILE_FLOATING_BOTTOM_STYLE} right: calc(env(safe-area-inset-right, 0px) + 1rem);`;
export const MOBILE_PREVIEW_CONTROLS_INSET =
	"calc(env(safe-area-inset-bottom, 0px) + 4.75rem)";
export const EDITOR_2D_VIEWPORT_HINT_TEXT =
	"Drag to pan. Wheel or pinch to zoom. Click/tap to edit.";

export function createViewportHintClass(
	visible,
	isMobileLayout,
	{
		mobilePlacementClass = "top-4",
		desktopPlacementClass = "right-4 bottom-4",
	} = {},
) {
	return $(() => {
		const visibleValue = visible.value;
		const mobile = isMobileLayout.value;
		if (!visibleValue) return "hidden";
		const placement = mobile
			? `left-1/2 z-10 w-[min(calc(100%-2rem),320px)] -translate-x-1/2 text-center ${mobilePlacementClass}`
			: desktopPlacementClass;
		return [
			"pointer-events-none absolute rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-[11px] font-medium text-slate-500 backdrop-blur dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-400",
			placement,
		].join(" ");
	});
}

export function createThemeOptionClass(themeMode, mode) {
	return $(() => {
		const active = themeMode.value === mode;
		return [
			"rounded-lg px-3 h-7.5 text-xs font-bold uppercase tracking-wider transition",
			active
				? "bg-white text-gray-900 shadow-sm dark:bg-slate-800 dark:text-slate-100"
				: "text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200",
		].join(" ");
	});
}

export function createPreviewOptionClass(previewMode, mode) {
	return $(() => {
		const active = previewMode.value === mode;
		return [
			"rounded-lg px-3 h-7.5 text-xs font-bold uppercase tracking-wider transition",
			active
				? "bg-white text-gray-900 shadow-sm dark:bg-slate-800 dark:text-slate-100"
				: "text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200",
		].join(" ");
	});
}

export function createExportButtonClass(exportInFlight) {
	return $(() =>
		[
			PRIMARY_BUTTON_CLASS,
			"rounded-r-none",
			exportInFlight.value ? "cursor-wait opacity-70" : "",
		].join(" "),
	);
}

export function createExportDropdownButtonClass(exportInFlight) {
	return $(() =>
		[
			"flex items-center justify-center bg-blue-600 text-white rounded-r-xl rounded-l-none h-10 px-2 leading-none hover:bg-blue-700 transition border-l border-blue-500/70 shadow-lg shadow-blue-600/20 dark:bg-blue-500 dark:hover:bg-blue-400 dark:border-blue-400/40",
			exportInFlight.value ? "cursor-wait opacity-70 pointer-events-none" : "",
		].join(" "),
	);
}

export function createExportMenuItemClass(exportFormat, format) {
	return $(() =>
		[
			"flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold transition",
			exportFormat.value === format
				? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"
				: "text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800",
		].join(" "),
	);
}

export function createEditor2DViewportClass(isMobileLayout) {
	return $(() =>
		isMobileLayout.value ? "absolute inset-x-0 top-0" : "absolute inset-0",
	);
}

export function createEditor2DViewportStyle(isMobileLayout) {
	return $(() =>
		isMobileLayout.value
			? `bottom: ${MOBILE_PREVIEW_CONTROLS_INSET};`
			: undefined,
	);
}

export function createConfigPanelClass(isMobileLayout, mobileConfigPanelOpen) {
	return $(() => {
		const mobile = isMobileLayout.value;
		const drawerOpen = mobileConfigPanelOpen.value;
		return [
			"bg-gray-50 border-gray-200 flex flex-col z-40 dark:bg-slate-950 dark:border-slate-800",
			mobile
				? [
						"fixed inset-y-0 left-0 w-[min(92vw,400px)] max-w-full border-r shadow-[0_24px_80px_rgba(15,23,42,0.28)] transition-transform duration-200 ease-out",
						drawerOpen ? "translate-x-0" : "-translate-x-full",
					].join(" ")
				: "w-[400px] min-w-[400px] shrink-0 h-full overflow-auto border-r",
		].join(" ");
	});
}

export function createConfigPanelBodyClass(isMobileLayout) {
	return $(() =>
		[
			"h-full overflow-auto flex flex-col gap-8",
			isMobileLayout.value ? "p-5" : "p-8",
		].join(" "),
	);
}

export function createAppShellClass(isMobileLayout) {
	return $(() =>
		[
			"h-screen [height:100dvh] flex overflow-hidden font-sans bg-white text-gray-900 dark:bg-slate-950 dark:text-slate-100",
			isMobileLayout.value ? "flex-col" : "flex-row",
		].join(" "),
	);
}
