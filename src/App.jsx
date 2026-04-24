import { signal, $, watch, onDispose, If } from "refui";
import ConfigPanel from "./components/ConfigPanel.jsx";
import PreviewPane from "./components/PreviewPane.jsx";
import { CopyScadModal, AboutModal } from "./components/AppModals.jsx";
import {
	MOBILE_FLOATING_LEFT_STYLE,
	MOBILE_FLOATING_RIGHT_STYLE,
	createAppShellClass,
	createConfigPanelBodyClass,
	createConfigPanelClass,
	createEditor2DViewportClass,
	createEditor2DViewportStyle,
	createExportButtonClass,
	createExportDropdownButtonClass,
	createExportMenuItemClass,
	createPreviewOptionClass,
	createThemeOptionClass,
} from "./ui-styles.js";
import {
	DEFAULT_PART_ID,
	getPartMetadata,
	listPartMetadata,
	loadPartDefinition,
} from "./parts/index.js";
import { createConfigManager } from "./config-manager.js";

// --- Constants & Pure Utils ---

const EXPORT_FORMAT_OPTIONS = [
	{
		value: "stl-binary",
		label: "STL",
		extension: "stl",
		mimeType: "model/stl",
	},
	{
		value: "stl-ascii",
		label: "ASCII STL",
		extension: "stl",
		mimeType: "model/stl",
	},
	{ value: "3mf", label: "3MF", extension: "3mf", mimeType: "model/3mf" },
];
const BOARD_DIMENSION_MIN = 1;
const TOP_COLUMN_MIN = 0;
const STACK_COUNT_MIN = 1;
const TILE_SIZE_MIN = Math.ceil(Math.sqrt(2.6 ** 2 * 2) + 4.2);
const MEASUREMENT_MIN = 0;
const POSITIVE_MEASUREMENT_MIN = 0.1;
const SEGMENTS_MIN = 3;
const COUNTERSINK_DEGREE_MIN = 1;
const MOBILE_LAYOUT_BREAKPOINT = 1200;
const MOBILE_LAYOUT_MEDIA_QUERY = `(max-width: ${MOBILE_LAYOUT_BREAKPOINT - 1}px)`;
const PART_OPTIONS = listPartMetadata();

function clamp(v, lo, hi) {
	return Math.max(lo, Math.min(hi, v));
}

function clampNumberInput(raw, min, max = Infinity, fallback = min) {
	const value = Number(raw);
	if (!Number.isFinite(value)) return fallback;
	return clamp(value, min, max);
}

function clampIntegerInput(raw, min, max, fallback = min) {
	return Math.round(clampNumberInput(raw, min, max, fallback));
}

function getExportFormatMeta(format) {
	return (
		EXPORT_FORMAT_OPTIONS.find((option) => option.value === format) ??
		EXPORT_FORMAT_OPTIONS[0]
	);
}

const configManager = createConfigManager({
	defaultPartId: DEFAULT_PART_ID,
	resolvePartId: (partId) => getPartMetadata(partId).id,
});

const INITIAL_GLOBAL_CONFIG = configManager.loadGlobalConfig();

function mergePartConfig(part, partConfig) {
	const defaults = part.createDefaultConfig?.() ?? {};
	return { ...defaults, ...(partConfig ?? {}) };
}

function getInitialPartConfig(part) {
	return mergePartConfig(part, configManager.loadPartConfig(part.id));
}

export default function App() {
	const activePartId = signal(INITIAL_GLOBAL_CONFIG.partId);
	const themeMode = signal(INITIAL_GLOBAL_CONFIG.themeMode);
	const previewMode = signal("2d");
	const exportFormat = signal(INITIAL_GLOBAL_CONFIG.exportFormat);
	const systemPrefersDark = signal(false);
	const exportInFlight = signal(false);
	const exportError = signal("");
	const previewMesh = signal(null);
	const previewLoading = signal(false);
	const previewError = signal("");
	const showModal = signal(false);
	const showAboutModal = signal(false);
	const layoutMedia = window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY);
	const userAgent = navigator.userAgent;
	const isIOSWebKit =
		/iPad|iPhone|iPod/i.test(userAgent) ||
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
	const isSafariDesktop =
		/Safari/i.test(userAgent) &&
		!/Chrome|Chromium|CriOS|Edg|OPR|OPiOS|FxiOS|Firefox|Android/i.test(
			userAgent,
		);
	const isWebKitEngine = signal(isIOSWebKit || isSafariDesktop);
	const isMobileLayout = signal(layoutMedia.matches);
	const isDesktopLayout = $(() => !isMobileLayout.value);
	const mobileConfigPanelOpen = signal(false);
	const persistConfig = signal(false);
	const exportWorker = new Worker(
		new URL("./export-worker.js", import.meta.url),
		{ type: "module" },
	);
	let workerRequestId = 0;
	const pendingWorkerRequests = new Map();
	const currentPartImplementation = signal(null);
	const currentPartController = signal(null);
	const currentPartLoadError = signal("");
	const currentEditor2D = signal(null);
	const currentConfigPanelSection = signal(null);
	const currentPartConfigState = signal(null);
	const currentPartExportConfigState = signal({});
	let currentPartLoadVersion = 0;
	const partControllerCache = new Map();
	let bridgedPartControllers = new WeakSet();
	const currentPart = $(() => {
		const implementation = currentPartImplementation.value;
		const activeId = activePartId.value;
		return implementation?.id === activeId ? implementation : null;
	});
	const tileSize = 56;
	const pad = 32;

	const readPartControllerState = (controller) => ({
		config: controller?.getConfigState ? controller.getConfigState() : null,
		exportConfig: controller?.buildExportConfig
			? controller.buildExportConfig()
			: {},
	});

	const syncPartControllerState = (part, controller) => {
		if (!part || !controller) {
			currentPartConfigState.value = null;
			currentPartExportConfigState.value = {};
			return;
		}
		if (
			activePartId.value !== part.id ||
			currentPartController.value !== controller
		) {
			return;
		}
		const state = readPartControllerState(controller);
		currentPartConfigState.value = state.config;
		currentPartExportConfigState.value = state.exportConfig;
	};

	const bridgePartControllerState = (part, controller) => {
		if (!part || !controller || bridgedPartControllers.has(controller)) return;
		bridgedPartControllers.add(controller);
		watch(() => {
			const state = readPartControllerState(controller);
			const isActivePart = activePartId.value === part.id;
			const isCurrentController = currentPartController.value === controller;
			if (!isActivePart || !isCurrentController) return;
			currentPartConfigState.value = state.config;
			currentPartExportConfigState.value = state.exportConfig;
		});
	};

	const createPartController = (part, initialConfig = getInitialPartConfig(part)) => {
		const defaults = part.createDefaultConfig?.() ?? {};
		const controller = part.createController({
			defaults,
			initialConfig: mergePartConfig(part, initialConfig),
			tileSize,
			editorPad: pad,
		});
		bridgePartControllerState(part, controller);
		return controller;
	};

	const ensurePartController = (part) => {
		if (!part?.createController) return null;
		if (!partControllerCache.has(part.id)) {
			partControllerCache.set(part.id, createPartController(part));
		}
		return partControllerCache.get(part.id);
	};

	const activatePartController = (part, controller) => {
		currentPartImplementation.value = part;
		currentPartController.value = controller;
		syncPartControllerState(part, controller);
	};

	exportWorker.onmessage = ({ data }) => {
		const pending = pendingWorkerRequests.get(data.id);
		if (!pending) return;
		pendingWorkerRequests.delete(data.id);
		if (data.ok) pending.resolve(data);
		else pending.reject(new Error(data.error));
	};

	exportWorker.onerror = (event) => {
		const error = event.message || "Export worker failed.";
		for (const pending of pendingWorkerRequests.values())
			pending.reject(new Error(error));
		pendingWorkerRequests.clear();
	};

	watch(() => {
		const partId = activePartId.value;
		const loadVersion = ++currentPartLoadVersion;
		currentPartLoadError.value = "";
		currentPartImplementation.value = null;
		currentPartController.value = null;
		currentPartConfigState.value = null;
		currentPartExportConfigState.value = {};
		loadPartDefinition(partId)
			.then((part) => {
				if (loadVersion !== currentPartLoadVersion) return;
				const controller = ensurePartController(part);
				activatePartController(part, controller);
			})
			.catch((error) => {
				if (loadVersion !== currentPartLoadVersion) return;
				currentPartImplementation.value = null;
				currentPartController.value = null;
				currentPartConfigState.value = null;
				currentPartExportConfigState.value = {};
				currentPartLoadError.value =
					error instanceof Error ? error.message : "Failed to load part.";
			});
	});

	const applyGlobalConfig = (config) => {
		const globalConfig = configManager.normalizeGlobalConfig(config);
		const targetPartId = globalConfig.partId;
		const loadedPart =
			currentPartImplementation.value?.id === targetPartId
				? currentPartImplementation.value
				: null;
		if (activePartId.value !== targetPartId) {
			currentPartImplementation.value = null;
			currentPartController.value = null;
			currentPartConfigState.value = null;
			currentPartExportConfigState.value = {};
		}
		activePartId.value = targetPartId;
		themeMode.value = globalConfig.themeMode;
		exportFormat.value = globalConfig.exportFormat;
		if (loadedPart) {
			const controller = ensurePartController(loadedPart);
			activatePartController(loadedPart, controller);
		}
	};
	applyGlobalConfig(INITIAL_GLOBAL_CONFIG);
	persistConfig.value = true;

	const getGlobalConfigState = () => ({
		partId: activePartId.value,
		themeMode: themeMode.value,
		exportFormat: exportFormat.value,
	});

	const getCurrentPartConfigState = () => {
		return currentPartConfigState.value;
	};

	watch(() => {
		exportWorker.postMessage({ type: "warmup", partId: activePartId.value });
	});

	const themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
	systemPrefersDark.value = themeMedia.matches;
	const onThemeChange = (event) => {
		systemPrefersDark.value = event.matches;
	};
	if (themeMedia.addEventListener)
		themeMedia.addEventListener("change", onThemeChange);
	else themeMedia.addListener(onThemeChange);
	onDispose(() => {
		if (themeMedia.removeEventListener)
			themeMedia.removeEventListener("change", onThemeChange);
		else themeMedia.removeListener(onThemeChange);
	});

	onDispose(() => {
		for (const pending of pendingWorkerRequests.values())
			pending.reject(new Error("Worker task was interrupted."));
		pendingWorkerRequests.clear();
		exportWorker.terminate();
	});

	// Save to local storage
	watch(() => {
		const shouldPersist = persistConfig.value;
		const globalConfigState = getGlobalConfigState();
		const partConfigState = getCurrentPartConfigState();
		if (!shouldPersist) return;
		configManager.saveGlobalConfig(globalConfigState);
		if (partConfigState) {
			configManager.savePartConfig(globalConfigState.partId, partConfigState);
		}
	});

	const resolvedTheme = $(() => {
		if (themeMode.value === "auto")
			return systemPrefersDark.value ? "dark" : "light";
		return themeMode.value;
	});

	watch(() => {
		const isDark = resolvedTheme.value === "dark";
		document.documentElement.classList.toggle("dark", isDark);
		document.documentElement.style.colorScheme = resolvedTheme.value;
	});

	const exportConfig = $(() => ({
		partId: activePartId.value,
		...(currentPartExportConfigState.value ?? {}),
	}));
	const previewConfigJson = $(() => JSON.stringify(exportConfig.value));
	const exportText = $(() => {
		const part = currentPart.value;
		return part?.buildExportText ? part.buildExportText(exportConfig.value) : "";
	});

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(exportText.value);
			showModal.value = true;
		} catch (error) {
			console.error("Failed to copy text export.", error);
		}
	};

	const requestWorker = (type, payload = {}) =>
		new Promise((resolve, reject) => {
			const id = ++workerRequestId;
			pendingWorkerRequests.set(id, { resolve, reject });
			exportWorker.postMessage({ id, type, ...payload });
		});

	const renderExport = (partId, config, format) =>
		requestWorker("render-export", { partId, config, format });
	const renderPreviewMesh = (partId, config) =>
		requestWorker("preview-mesh", { partId, config });

	const downloadExport = async () => {
		if (exportInFlight.value) return;
		if (!supportedExportFormatOptions.value.length) {
			exportError.value = "This part does not support file export yet.";
			return;
		}
		exportInFlight.value = true;
		exportError.value = "";
		let objectUrl = null;

		try {
			const part = currentPart.value ?? (await loadPartDefinition(activePartId.value));
			const controller = ensurePartController(part);
			currentPartImplementation.value = part;
			currentPartController.value = controller;
			const config = exportConfig.value;
			const format = exportFormat.value;
			const formatMeta = getExportFormatMeta(format);
			const filename = part.buildExportFilename
				? part.buildExportFilename(config, formatMeta)
				: `${part.metadata.slug || part.metadata.id}.${formatMeta.extension}`;
			const { bytes, mimeType, logs } = await renderExport(
				part.id,
				config,
				format,
			);
			const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
			objectUrl = URL.createObjectURL(blob);
			const element = document.createElement("a");
			element.href = objectUrl;
			element.download = filename;
			document.body.appendChild(element);
			element.click();
			document.body.removeChild(element);
			if (logs?.length) console.info("Export:", logs.join("\n"));
		} catch (error) {
			console.error("Export failed.", error);
			exportError.value =
				error instanceof Error ? error.message : "Export failed.";
		} finally {
			if (objectUrl) URL.revokeObjectURL(objectUrl);
			exportInFlight.value = false;
		}
	};

	const chooseExportFormat = (format, event) => {
		if (!supportedExportFormatOptions.value.some((option) => option.value === format)) {
			return;
		}
		exportFormat.value = format;
		event?.currentTarget?.closest("details")?.removeAttribute("open");
	};

	const openCopyScadFromMenu = (event) => {
		if (!canCopyTextExport.value) return;
		event?.currentTarget?.closest("details")?.removeAttribute("open");
		copy();
	};

	const closeExportMenus = () => {
		for (const element of document.querySelectorAll(".js-export-menu[open]")) {
			element.removeAttribute("open");
		}
	};

	const openConfigPanel = () => {
		mobileConfigPanelOpen.value = true;
	};

	const closeConfigPanel = () => {
		mobileConfigPanelOpen.value = false;
	};

	const clearConfiguration = () => {
		persistConfig.value = false;
		configManager.clearAll();
		partControllerCache.clear();
		const part = currentPart.value;
		if (part?.createController) {
			bridgedPartControllers = new WeakSet();
			const defaults = part.createDefaultConfig?.() ?? {};
			const controller = createPartController(part, defaults);
			partControllerCache.set(part.id, controller);
			activatePartController(part, controller);
		} else {
			currentPartController.value = null;
			currentPartConfigState.value = null;
			currentPartExportConfigState.value = {};
		}
		queueMicrotask(() => {
			persistConfig.value = true;
		});
	};

	const switchActivePart = (partId) => {
		const metadata = getPartMetadata(partId);
		if (metadata.id === activePartId.value) return;
		const currentGlobalConfig = getGlobalConfigState();
		const currentPartConfig = getCurrentPartConfigState();
		if (persistConfig.value && currentPartConfig) {
			configManager.savePartConfig(currentGlobalConfig.partId, currentPartConfig);
		}
		const nextGlobalConfig = {
			...currentGlobalConfig,
			partId: metadata.id,
		};
		if (persistConfig.value) {
			configManager.saveGlobalConfig(nextGlobalConfig);
		}
		currentPartImplementation.value = null;
		currentPartController.value = null;
		currentPartConfigState.value = null;
		currentPartExportConfigState.value = {};
		activePartId.value = metadata.id;
	};

	const editor2DBoardMaterialClipId = "editor-2d-board-material-clip";
	const editor2DNodeMaskId = "editor-2d-node-mask";
	const editor2DBackgroundStyle = $(() =>
		resolvedTheme.value === "dark"
			? "background: linear-gradient(180deg, #0f172a 0%, #020617 100%);"
			: "background: linear-gradient(180deg, #f8fafc 0%, #dbeafe 100%);",
	);
	const editor2DViewportClass = createEditor2DViewportClass(isMobileLayout);
	const editor2DViewportStyle = createEditor2DViewportStyle(isMobileLayout);
	const createPartFrontendContext = (partController) =>
		Object.freeze({
			app: Object.freeze({
				signals: Object.freeze({
					activePartId,
					isMobileLayout,
					resolvedTheme,
				}),
				actions: Object.freeze({
					switchActivePart,
					clearConfiguration,
					clampIntegerInput,
					clampNumberInput,
				}),
				constants: Object.freeze({
					BOARD_DIMENSION_MIN,
					TOP_COLUMN_MIN,
					STACK_COUNT_MIN,
					TILE_SIZE_MIN,
					MEASUREMENT_MIN,
					POSITIVE_MEASUREMENT_MIN,
					SEGMENTS_MIN,
					COUNTERSINK_DEGREE_MIN,
					editor2D: Object.freeze({
						pad,
						tileSize,
						editor2DBoardMaterialClipId,
						editor2DNodeMaskId,
					}),
				}),
			}),
			partController,
		});

	const themeOptionClass = (mode) => createThemeOptionClass(themeMode, mode);
	const previewOptionClass = (mode) =>
		createPreviewOptionClass(previewMode, mode);
	const supportedExportFormatOptions = $(() => {
		const formats = currentPart.value?.capabilities?.exportFormats ?? [];
		return EXPORT_FORMAT_OPTIONS.filter((option) => formats.includes(option.value));
	});
	const exportButtonClass = createExportButtonClass(exportInFlight);
	const exportDropdownButtonClass =
		createExportDropdownButtonClass(exportInFlight);
	const exportMenuItemClass = (format) =>
		createExportMenuItemClass(exportFormat, format);
	const canPreview3D = $(() => !!currentPart.value?.capabilities?.preview);
	const canCopyTextExport = $(
		() => !!currentPart.value?.capabilities?.textExport,
	);

	watch(() => {
		if (!canPreview3D.value && previewMode.value === "3d") {
			previewMode.value = "2d";
		}
	});

	watch(() => {
		const options = supportedExportFormatOptions.value;
		if (!options.length) return;
		if (options.some((option) => option.value === exportFormat.value)) return;
		exportFormat.value = options[0].value;
	});
	watch(() => {
		const part = currentPart.value;
		const configPanel = part?.configPanel;
		const controller = currentPartController.value;
		currentConfigPanelSection.value = configPanel?.create && controller
			? configPanel.create(createPartFrontendContext(controller))
			: null;
	});

	const baseEditor2DViewportProps = Object.freeze({
		backgroundStyle: editor2DBackgroundStyle,
		viewportClass: editor2DViewportClass,
		viewportStyle: editor2DViewportStyle,
		baseTileSize: tileSize,
		isWebKitEngine,
	});

	watch(() => {
		const editor = currentPart.value?.editors?.preview2D;
		const controller = currentPartController.value;
		if (!editor?.create || !controller) {
			currentEditor2D.value = null;
			return;
		}

		const nextEditor = editor.create(createPartFrontendContext(controller));
		currentEditor2D.value = Object.freeze({
			...nextEditor,
			viewportProps: Object.freeze({
				...baseEditor2DViewportProps,
				sceneWidth: nextEditor.scene.svgW,
				sceneHeight: nextEditor.scene.svgH,
			}),
		});
	});

	let previewTimer = null;
	let previewSequence = 0;

	const cancelPreviewRender = (clearMesh = false) => {
		if (previewTimer) {
			clearTimeout(previewTimer);
			previewTimer = null;
		}
		previewSequence += 1;
		previewLoading.value = false;
		previewError.value = "";
		if (clearMesh) previewMesh.value = null;
	};

	const queuePreviewRender = (partId, config) => {
		if (previewTimer) clearTimeout(previewTimer);
		previewTimer = setTimeout(async () => {
			const sequence = ++previewSequence;
			previewLoading.value = true;
			previewError.value = "";

			try {
				const { mesh } = await renderPreviewMesh(partId, config);
				if (sequence !== previewSequence) return;
				previewMesh.value = mesh;
				previewLoading.value = false;
			} catch (error) {
				if (sequence !== previewSequence) return;
				console.error("Preview generation failed.", error);
				previewError.value =
					error instanceof Error ? error.message : "Preview generation failed.";
				previewLoading.value = false;
			}
		}, 120);
	};

	watch(() => {
		const partId = activePartId.value;
		const previewConfig = JSON.parse(previewConfigJson.value);
		if (previewMode.value !== "3d" || !canPreview3D.value) {
			cancelPreviewRender(false);
			return;
		}
		queuePreviewRender(partId, previewConfig);
	});

	onDispose(() => {
		cancelPreviewRender(false);
	});

	const syncLayoutMode = (matches) => {
		const nextIsMobile = matches;
		const previousIsMobile = isMobileLayout.value;
		isMobileLayout.value = nextIsMobile;
		if (nextIsMobile !== previousIsMobile) {
			mobileConfigPanelOpen.value = false;
		}
	};
	const onLayoutChange = (event) => {
		syncLayoutMode(event.matches);
	};

	syncLayoutMode(layoutMedia.matches);
	if (layoutMedia.addEventListener)
		layoutMedia.addEventListener("change", onLayoutChange);
	else layoutMedia.addListener(onLayoutChange);
	onDispose(() => {
		if (layoutMedia.removeEventListener)
			layoutMedia.removeEventListener("change", onLayoutChange);
		else layoutMedia.removeListener(onLayoutChange);
	});

	const onPointerDown = (event) => {
		if (event.target?.closest?.(".js-export-menu")) return;
		closeExportMenus();
	};
	document.addEventListener("pointerdown", onPointerDown);
	onDispose(() => document.removeEventListener("pointerdown", onPointerDown));

	const configPanelClass = createConfigPanelClass(
		isMobileLayout,
		mobileConfigPanelOpen,
	);
	const configPanelBodyClass = createConfigPanelBodyClass(isMobileLayout);
	const showMobileConfigOverlay = $(() => {
		const mobile = isMobileLayout.value;
		const drawerOpen = mobileConfigPanelOpen.value;
		return mobile && drawerOpen;
	});
	const appShellClass = createAppShellClass(isMobileLayout);

	const themeControls = {
		themeOptionClass,
		themeMode,
	};
	const downloadControls = {
		available: $(() => supportedExportFormatOptions.value.length > 0),
		canCopyTextExport,
		mobileFloatingRightStyle: MOBILE_FLOATING_RIGHT_STYLE,
		exportButtonClass,
		downloadExport,
		exportInFlight,
		exportFormat,
		exportDropdownButtonClass,
		exportMenuItemClass,
		openCopyScadFromMenu,
		chooseExportFormat,
		exportFormatOptions: supportedExportFormatOptions,
	};
	const previewModeControls = {
		mobileFloatingLeftStyle: MOBILE_FLOATING_LEFT_STYLE,
		show3D: canPreview3D,
		previewOptionClass,
		previewMode,
	};
	const paneError = $(() => exportError.value || currentPartLoadError.value);
	const editor2DKey = $(() => (currentEditor2D.value ? activePartId.value : ""));
	const configPanelProps = {
		themeControls,
		classes: {
			configPanelClass,
			configPanelBodyClass,
		},
		partOptions: PART_OPTIONS,
		signals: {
			activePartId,
			isMobileLayout,
		},
		actions: {
			closeConfigPanel,
			switchActivePart,
			clearConfiguration,
		},
		activePartConfigSection: currentConfigPanelSection,
	};
	const previewPaneProps = {
		showAboutModal,
		openConfigPanel,
		exportError: paneError,
		isMobileLayout,
		isDesktopLayout,
		previewMode,
		previewMesh,
		previewLoading,
		previewError,
		resolvedTheme,
		editor2DKey,
		resolveEditor2D: () => currentEditor2D.value,
	};
	const copyModalProps = {
		showModal,
		exportText,
		close: () => (showModal.value = false),
	};
	const aboutModalProps = {
		showAboutModal,
		partCredits: PART_OPTIONS.filter((option) => option.credit),
		close: () => (showAboutModal.value = false),
	};

	return (
		<div class={appShellClass}>
			<If condition={showMobileConfigOverlay}>
				{() => (
					<div
						class="fixed inset-0 z-30 bg-slate-950/45 backdrop-blur-[1px]"
						on:click={closeConfigPanel}
					></div>
				)}
			</If>
			<ConfigPanel panel={configPanelProps} />
			<PreviewPane
				pane={previewPaneProps}
				controls={{
					theme: themeControls,
					download: downloadControls,
					previewMode: previewModeControls,
				}}
			/>
			<CopyScadModal modal={copyModalProps} />
			<AboutModal modal={aboutModalProps} />
		</div>
	);
}
