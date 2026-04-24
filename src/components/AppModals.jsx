import { If } from "refui";
import {
	MODAL_ACTION_CLASS,
	MODAL_PRIMARY_ACTION_CLASS,
} from "../ui-styles.js";

export function CopyScadModal({ modal }) {
	const { showModal, exportText, close } = modal;

	return (
		<If condition={showModal}>
			{() => (
				<div class="fixed inset-0 z-[100] flex items-center justify-center p-8">
					<div
						class="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
						on:click={close}
					></div>
					<div class="bg-white rounded-3xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden relative animate-modal-in dark:bg-slate-950 dark:border dark:border-slate-800">
						<div class="p-6 border-b border-gray-200 flex justify-between items-center dark:border-slate-800">
							<h3 class="text-xl font-bold text-gray-900 dark:text-slate-100">
								Copy SCAD Code
							</h3>
							<button
								class="text-gray-400 hover:text-gray-600 transition dark:text-slate-500 dark:hover:text-slate-300"
								on:click={close}
							>
								<svg
									class="w-6 h-6"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M6 18L18 6M6 6l12 12"
									></path>
								</svg>
							</button>
						</div>
						<div class="p-6 bg-gray-50 dark:bg-slate-900/60">
							<textarea
								readonly
								class="w-full h-80 border border-gray-200 rounded-xl p-4 font-mono text-[10px] text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition leading-tight resize-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-400/20"
								$ref={(el) => {
									if (el) el.select();
								}}
								value={exportText}
							/>
						</div>
						<div class="p-6 border-t border-gray-200 flex justify-end gap-3 dark:border-slate-800">
							<button class={MODAL_ACTION_CLASS} on:click={close}>
								Close
							</button>
							<button
								class={MODAL_PRIMARY_ACTION_CLASS}
								on:click={async () => {
									await navigator.clipboard.writeText(exportText.value);
									close();
								}}
							>
								Copy to Clipboard
							</button>
						</div>
					</div>
				</div>
			)}
		</If>
	);
}

export function AboutModal({ modal }) {
	const { showAboutModal, partCredits = [], close } = modal;

	return (
		<If condition={showAboutModal}>
			{() => (
				<div class="fixed inset-0 z-[100] flex items-center justify-center p-8">
					<div
						class="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
						on:click={close}
					></div>
					<div class="bg-white rounded-3xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden relative animate-modal-in dark:bg-slate-950 dark:border dark:border-slate-800">
						<div class="p-6 border-b border-gray-200 flex justify-between items-center dark:border-slate-800">
							<h3 class="text-xl font-bold text-gray-900 dark:text-slate-100">
								About openGrid Studio
							</h3>
							<button
								class="text-gray-400 hover:text-gray-600 transition dark:text-slate-500 dark:hover:text-slate-300"
								on:click={close}
							>
								<svg
									class="w-6 h-6"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M6 18L18 6M6 6l12 12"
									></path>
								</svg>
							</button>
						</div>
						<div class="p-6 bg-gray-50 grid gap-5 text-sm text-gray-700 dark:bg-slate-900/60 dark:text-slate-300">
							<div class="grid gap-2">
								<div class="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500">
									Project
								</div>
								<p>
									openGrid Studio is a browser-based editor for designing
									openGrid boards with fast 2D editing, realtime 3D preview,
									and direct export.
								</p>
								<p>
									Repository:{" "}
									<a
										class="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
										href="https://github.com/ClassicOldSong/openGrid-Studio"
										target="_blank"
										rel="noreferrer"
									>
										github.com/ClassicOldSong/openGrid-Studio
									</a>
								</p>
							</div>
							<div class="grid gap-2">
								<div class="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500">
									Credits
								</div>
								<p>
									Original openGrid project: based on the original openGrid
									design and generator.{" "}
									<a
										class="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
										href="https://www.opengrid.world/"
										target="_blank"
										rel="noreferrer"
									>
										opengrid.world
									</a>
								</p>
								<p>
									Manifold: powered by the Manifold geometry kernel and the{" "}
									<code>manifold-3d</code> browser bindings used for realtime
									preview and export.{" "}
									<a
										class="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
										href="https://github.com/elalish/manifold"
										target="_blank"
										rel="noreferrer"
									>
										github.com/elalish/manifold
									</a>
								</p>
								<p>
									Yukino Song: openGrid Studio by Yukino Song.{" "}
									<a
										class="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
										href="https://x.com/ClassicOldSong"
										target="_blank"
										rel="noreferrer"
									>
										x.com/ClassicOldSong
									</a>
								</p>
							</div>
							<If condition={partCredits.length > 0}>
								{() => (
									<div class="grid gap-2">
										<div class="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500">
											Part Credits
										</div>
										{partCredits.map((part) => (
											<p>
												{part.name}: {part.credit.label}.{" "}
												<a
													class="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
													href={part.credit.url}
													target="_blank"
													rel="noreferrer"
												>
													{part.credit.url.replace(/^https?:\/\//, "")}
												</a>
											</p>
										))}
									</div>
								)}
							</If>
						</div>
						<div class="p-6 border-t border-gray-200 flex justify-end dark:border-slate-800">
							<button class={MODAL_PRIMARY_ACTION_CLASS} on:click={close}>
								Close
							</button>
						</div>
					</div>
				</div>
			)}
		</If>
	);
}
