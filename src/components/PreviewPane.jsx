import { If } from "refui";
import Preview3D from "./Preview3D.jsx";
import Editor2D from "./Editor2D.jsx";
import { DownloadActions, PreviewModeSwitcher, ThemeSwitcher } from "./AppControls.jsx";
import { ABOUT_BUTTON_CLASS } from "../ui-styles.js";

export default function PreviewPane({ pane, controls }) {
	const {
		showAboutModal,
		openConfigPanel,
		exportError,
		isMobileLayout,
		isDesktopLayout,
		previewMode,
		previewMesh,
		previewLoading,
		previewError,
		resolvedTheme,
		editor2D,
	} = pane;

	return (
		<div class="flex-1 min-w-0 flex flex-col h-full bg-white relative dark:bg-slate-950">
			<div class="border-b border-gray-200 bg-white z-20 shadow-sm dark:border-slate-800 dark:bg-slate-950">
				<div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-6 sm:py-3 lg:px-8">
					<div class="flex min-w-0 flex-wrap items-center gap-2 sm:gap-4">
						<If condition={isMobileLayout}>
							{() => (
								<button
									class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
									on:click={openConfigPanel}
									aria-label="Open configuration"
								>
									<svg
										aria-hidden="true"
										viewBox="0 0 20 20"
										class="h-5 w-5 fill-none stroke-current"
										stroke-width="1.8"
										stroke-linecap="round"
									>
										<path d="M3.5 5.5h13" />
										<path d="M3.5 10h13" />
										<path d="M3.5 14.5h13" />
									</svg>
								</button>
							)}
						</If>
						<img
							src="/logo.png"
							alt="openGrid Studio logo"
							class="h-7 w-7 rounded-lg object-contain shadow-lg shadow-blue-500/20 sm:h-8 sm:w-8"
						/>
						<h1 class="text-sm sm:text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-slate-400">
							openGrid Studio
						</h1>
						<button
							class={ABOUT_BUTTON_CLASS}
							on:click={() => (showAboutModal.value = true)}
						>
							ⓘ
						</button>
						<If condition={isDesktopLayout}>
							{() => <PreviewModeSwitcher controls={controls.previewMode} />}
						</If>
					</div>
					<If condition={isDesktopLayout}>
						{() => (
							<div class="flex w-full flex-wrap gap-2 items-center sm:w-auto sm:justify-end">
								<ThemeSwitcher controls={controls.theme} />
								<DownloadActions controls={controls.download} />
							</div>
						)}
					</If>
				</div>
			</div>
			<If condition={exportError}>
				{() => (
					<div class="px-4 sm:px-6 lg:px-8 py-3 border-b border-rose-200 bg-rose-50 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
						{exportError}
					</div>
				)}
			</If>

			<If condition={previewMode.eq("2d")}>
				{() => <Editor2D editor={editor2D} />}
			</If>
			<If condition={previewMode.eq("3d")}>
				{() => (
					<div class="flex-1 min-h-0 relative bg-gray-50/50 dark:bg-slate-900/40">
						<Preview3D
							mesh={previewMesh}
							loading={previewLoading}
							error={previewError}
							theme={resolvedTheme}
							mobileLayout={isMobileLayout}
						/>
					</div>
				)}
			</If>
			<If condition={isMobileLayout}>
				{() => <PreviewModeSwitcher mobile controls={controls.previewMode} />}
			</If>
			<If condition={isMobileLayout}>
				{() => <DownloadActions mobile controls={controls.download} />}
			</If>
		</div>
	);
}
