import { signal, $, watch, onDispose } from "refui";

const EDITOR_2D_MIN_ZOOM = 0.35;
const EDITOR_2D_MAX_ZOOM = 5;
const EDITOR_2D_DRAG_THRESHOLD = 6;
const EDITOR_2D_INITIAL_MAX_TILE_PX = 88;
const WEBKIT_EDITOR_2D_MAX_RASTER_SCALE = 2;

function clamp(v, lo, hi) {
	return Math.max(lo, Math.min(hi, v));
}

export function createEditor2DNavigation({
	sceneWidth,
	sceneHeight,
	baseTileSize,
	isWebKitEngine,
	readAction,
	performAction,
}) {
	const zoom = signal(1);
	const panX = signal(0);
	const panY = signal(0);
	const viewportWidth = signal(1);
	const viewportHeight = signal(1);
	const showHint = signal(true);

	let viewportEl = null;
	let resizeObserver = null;
	let pointerId = null;
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartPanX = 0;
	let dragStartPanY = 0;
	let dragStartSceneX = 0;
	let dragStartSceneY = 0;
	let gestureStartZoom = 1;
	let gestureStartPanX = 0;
	let gestureStartPanY = 0;
	let gestureStartDistance = 1;
	let gestureStartCenterX = 0;
	let gestureStartCenterY = 0;
	const activeTouches = new Map();
	let pressedAction = null;
	let isDragging = false;
	let gestureActive = false;
	let hasManualNavigation = false;
	let panOnlyPointer = false;

	const getDefaultScale = () => {
		const contentWidth = Math.max(sceneWidth.value, 1);
		const contentHeight = Math.max(sceneHeight.value, 1);
		const currentViewportWidth = Math.max(viewportWidth.value, 1);
		const currentViewportHeight = Math.max(viewportHeight.value, 1);
		const fitScale = Math.min(
			currentViewportWidth / contentWidth,
			currentViewportHeight / contentHeight,
		);
		const cappedScale = EDITOR_2D_INITIAL_MAX_TILE_PX / baseTileSize;
		return Math.min(fitScale, cappedScale);
	};

	const getSceneFrame = (
		zoomValue = zoom.value,
		panXValue = panX.value,
		panYValue = panY.value,
	) => {
		const contentWidth = sceneWidth.value;
		const contentHeight = sceneHeight.value;
		const currentViewportWidth = Math.max(viewportWidth.value, 1);
		const currentViewportHeight = Math.max(viewportHeight.value, 1);
		const nextZoom = clamp(
			zoomValue,
			EDITOR_2D_MIN_ZOOM,
			EDITOR_2D_MAX_ZOOM,
		);
		const scale = getDefaultScale() * nextZoom;
		const renderedWidth = contentWidth * scale;
		const renderedHeight = contentHeight * scale;
		const baseX = (currentViewportWidth - renderedWidth) / 2;
		const baseY = (currentViewportHeight - renderedHeight) / 2;
		const maxPanX =
			renderedWidth > currentViewportWidth
				? (renderedWidth - currentViewportWidth) / 2
				: 0;
		const maxPanY =
			renderedHeight > currentViewportHeight
				? (renderedHeight - currentViewportHeight) / 2
				: 0;
		const clampedPanX = clamp(panXValue, -maxPanX, maxPanX);
		const clampedPanY = clamp(panYValue, -maxPanY, maxPanY);

		return {
			contentWidth,
			contentHeight,
			viewportWidth: currentViewportWidth,
			viewportHeight: currentViewportHeight,
			scale,
			renderedWidth,
			renderedHeight,
			baseX,
			baseY,
			maxPanX,
			maxPanY,
			panX: clampedPanX,
			panY: clampedPanY,
			left: baseX + clampedPanX,
			top: baseY + clampedPanY,
		};
	};

	const setView = (
		zoomValue = zoom.value,
		panXValue = panX.value,
		panYValue = panY.value,
	) => {
		const nextZoom = clamp(
			zoomValue,
			EDITOR_2D_MIN_ZOOM,
			EDITOR_2D_MAX_ZOOM,
		);
		const frame = getSceneFrame(nextZoom, panXValue, panYValue);
		zoom.value = nextZoom;
		panX.value = frame.panX;
		panY.value = frame.panY;
	};

	const fitInitialView = () => {
		if (viewportWidth.value <= 1 || viewportHeight.value <= 1) return;
		setView(1, 0, 0);
	};

	const setViewFromAnchor = ({
		nextZoom,
		anchorClientX,
		anchorClientY,
		targetClientX = anchorClientX,
		targetClientY = anchorClientY,
		baseZoom = zoom.value,
		basePanX = panX.value,
		basePanY = panY.value,
	}) => {
		if (!viewportEl) {
			setView(nextZoom, basePanX, basePanY);
			return;
		}

		const rect = viewportEl.getBoundingClientRect();
		const anchorX = anchorClientX - rect.left;
		const anchorY = anchorClientY - rect.top;
		const targetX = targetClientX - rect.left;
		const targetY = targetClientY - rect.top;
		const sourceFrame = getSceneFrame(baseZoom, basePanX, basePanY);
		const worldX =
			(anchorX - sourceFrame.left) / Math.max(sourceFrame.scale, 0.0001);
		const worldY =
			(anchorY - sourceFrame.top) / Math.max(sourceFrame.scale, 0.0001);
		const nextFrame = getSceneFrame(nextZoom, 0, 0);

		setView(
			nextZoom,
			targetX - nextFrame.baseX - worldX * nextFrame.scale,
			targetY - nextFrame.baseY - worldY * nextFrame.scale,
		);
	};

	const updateViewportSize = () => {
		if (!viewportEl) return;
		const rect = viewportEl.getBoundingClientRect();
		viewportWidth.value = Math.max(1, Math.floor(rect.width));
		viewportHeight.value = Math.max(1, Math.floor(rect.height));
	};

	const attachViewport = (el) => {
		viewportEl = el;
		resizeObserver?.disconnect();
		resizeObserver = null;

		if (el && typeof ResizeObserver !== "undefined") {
			resizeObserver = new ResizeObserver(updateViewportSize);
			resizeObserver.observe(el);
			queueMicrotask(updateViewportSize);
		}
	};

	const clientPointToScenePoint = (
		clientX,
		clientY,
		baseZoom = zoom.value,
		basePanX = panX.value,
		basePanY = panY.value,
	) => {
		if (!viewportEl) return { x: 0, y: 0 };
		const rect = viewportEl.getBoundingClientRect();
		const frame = getSceneFrame(baseZoom, basePanX, basePanY);
		return {
			x: (clientX - rect.left - frame.left) / Math.max(frame.scale, 0.0001),
			y: (clientY - rect.top - frame.top) / Math.max(frame.scale, 0.0001),
		};
	};

	const beginTouchGesture = () => {
		const points = [...activeTouches.values()];
		if (points.length < 2) return;
		const [a, b] = points;
		gestureStartZoom = zoom.value;
		gestureStartPanX = panX.value;
		gestureStartPanY = panY.value;
		gestureStartDistance = Math.max(
			1,
			Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
		);
		gestureStartCenterX = (a.clientX + b.clientX) / 2;
		gestureStartCenterY = (a.clientY + b.clientY) / 2;
	};

	const updateTouchGesture = () => {
		const points = [...activeTouches.values()];
		if (points.length < 2) return;
		const [a, b] = points;
		const centerX = (a.clientX + b.clientX) / 2;
		const centerY = (a.clientY + b.clientY) / 2;
		const nextZoom =
			gestureStartZoom *
			(Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)) /
				gestureStartDistance);

		setViewFromAnchor({
			nextZoom,
			anchorClientX: gestureStartCenterX,
			anchorClientY: gestureStartCenterY,
			targetClientX: centerX,
			targetClientY: centerY,
			baseZoom: gestureStartZoom,
			basePanX: gestureStartPanX,
			basePanY: gestureStartPanY,
		});
	};

	const viewportViewBox = $(
		() =>
			`0 0 ${Math.max(viewportWidth.value, 1)} ${Math.max(viewportHeight.value, 1)}`,
	);
	const sceneViewBox = $(() => `0 0 ${sceneWidth.value} ${sceneHeight.value}`);
	const sceneFrame = $(() => getSceneFrame(zoom.value, panX.value, panY.value));
	const useCssTransformPath = isWebKitEngine;
	const svgRasterScale = $(() => {
		if (!useCssTransformPath.value) return 1;
		return clamp(
			Math.ceil(sceneFrame.value.scale),
			1,
			WEBKIT_EDITOR_2D_MAX_RASTER_SCALE,
		);
	});
	const sceneTransform = $(() => {
		if (useCssTransformPath.value) return undefined;
		const frame = sceneFrame.value;
		return `translate(${frame.left} ${frame.top}) scale(${frame.scale})`;
	});
	const svgClass = $(() =>
		useCssTransformPath.value
			? "absolute left-0 top-0 block max-w-none overflow-visible"
			: "block h-full w-full",
	);
	const svgStyle = $(() => {
		if (!useCssTransformPath.value) return "background: transparent;";
		const frame = sceneFrame.value;
		return `background: transparent; transform: translate3d(${frame.left}px, ${frame.top}px, 0) scale(${frame.scale / svgRasterScale.value}); transform-origin: 0 0; will-change: transform;`;
	});
	const svgViewBox = $(() =>
		useCssTransformPath.value ? sceneViewBox.value : viewportViewBox.value,
	);
	const svgPreserveAspectRatio = $(() =>
		useCssTransformPath.value ? undefined : "none",
	);
	const svgWidth = $(() =>
		useCssTransformPath.value
			? Math.max(1, Math.ceil(sceneWidth.value * svgRasterScale.value))
			: undefined,
	);
	const svgHeight = $(() =>
		useCssTransformPath.value
			? Math.max(1, Math.ceil(sceneHeight.value * svgRasterScale.value))
			: undefined,
	);

	watch(() => {
		const frame = getSceneFrame(zoom.value, panX.value, panY.value);
		if (frame.panX !== panX.value) panX.value = frame.panX;
		if (frame.panY !== panY.value) panY.value = frame.panY;
	});
	watch(() => {
		viewportWidth.value;
		viewportHeight.value;
		sceneWidth.value;
		sceneHeight.value;
		if (!hasManualNavigation) fitInitialView();
	});

	onDispose(() => resizeObserver?.disconnect());

	const startPointerSession = (
		nextPointerId,
		clientX,
		clientY,
		action,
		{ panOnly = false } = {},
	) => {
		pointerId = nextPointerId;
		panOnlyPointer = panOnly;
		dragStartX = clientX;
		dragStartY = clientY;
		dragStartPanX = panX.value;
		dragStartPanY = panY.value;
		const startScenePoint = clientPointToScenePoint(clientX, clientY);
		dragStartSceneX = startScenePoint.x;
		dragStartSceneY = startScenePoint.y;
		pressedAction = action
			? {
					...action,
					sceneX: startScenePoint.x,
					sceneY: startScenePoint.y,
				}
			: action;
		isDragging = false;
		if (viewportEl) viewportEl.style.cursor = "grabbing";
	};

	const finishPointerSession = () => {
		pointerId = null;
		pressedAction = null;
		panOnlyPointer = false;
		isDragging = false;
		if (viewportEl) viewportEl.style.cursor = "grab";
	};

	const performPressedAction = () => {
		performAction(pressedAction ?? { type: "empty-space" });
	};

	const isEditableElement = (target) => {
		if (!(target instanceof HTMLElement)) return false;
		if (target.isContentEditable) return true;
		return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
	};

	const blurEditableActiveElement = () => {
		const activeElement = document.activeElement;
		if (isEditableElement(activeElement)) activeElement.blur();
	};

	const onPointerDown = (event) => {
		showHint.value = false;
		blurEditableActiveElement();
		const action = readAction(event.target);

		if (event.pointerType === "touch") {
			activeTouches.set(event.pointerId, {
				pointerId: event.pointerId,
				clientX: event.clientX,
				clientY: event.clientY,
			});
			if (event.isTrusted) {
				event.currentTarget?.setPointerCapture?.(event.pointerId);
			}
			if (activeTouches.size >= 2) {
				pressedAction = null;
				gestureActive = true;
				hasManualNavigation = true;
				beginTouchGesture();
				return;
			}
			gestureActive = false;
			if (action?.dragBehavior) {
				const scenePoint = clientPointToScenePoint(event.clientX, event.clientY);
				performAction({
					...action,
					phase: "start",
					sceneX: scenePoint.x,
					sceneY: scenePoint.y,
					sceneDX: 0,
					sceneDY: 0,
				});
			}
			startPointerSession(event.pointerId, event.clientX, event.clientY, action);
			return;
		}

		if (event.button === 2) {
			event.preventDefault();
			return;
		}
		if (event.button === 1) {
			event.preventDefault();
			hasManualNavigation = true;
			startPointerSession(event.pointerId, event.clientX, event.clientY, null, {
				panOnly: true,
			});
			if (event.isTrusted) {
				event.currentTarget?.setPointerCapture?.(event.pointerId);
			}
			return;
		}
		if (event.button > 0) return;

		event.preventDefault();
		if (action?.dragBehavior) {
			const scenePoint = clientPointToScenePoint(event.clientX, event.clientY);
			performAction({
				...action,
				phase: "start",
				sceneX: scenePoint.x,
				sceneY: scenePoint.y,
				sceneDX: 0,
				sceneDY: 0,
			});
		}
		startPointerSession(event.pointerId, event.clientX, event.clientY, action);
		if (event.isTrusted) {
			event.currentTarget?.setPointerCapture?.(event.pointerId);
		}
	};

	const onPointerMove = (event) => {
		if (event.pointerType === "touch") {
			if (!activeTouches.has(event.pointerId)) return;
			activeTouches.set(event.pointerId, {
				pointerId: event.pointerId,
				clientX: event.clientX,
				clientY: event.clientY,
			});
			if (activeTouches.size >= 2) {
				pressedAction = null;
				gestureActive = true;
				hasManualNavigation = true;
				updateTouchGesture();
				return;
			}

			if (event.pointerId !== pointerId) return;
			const dx = event.clientX - dragStartX;
			const dy = event.clientY - dragStartY;
			if (!isDragging && Math.hypot(dx, dy) < EDITOR_2D_DRAG_THRESHOLD) {
				return;
			}
			isDragging = true;
			if (pressedAction?.dragBehavior) {
				const scenePoint = clientPointToScenePoint(event.clientX, event.clientY);
				performAction({
					...pressedAction,
					phase: "move",
					sceneX: scenePoint.x,
					sceneY: scenePoint.y,
					sceneDX: scenePoint.x - dragStartSceneX,
					sceneDY: scenePoint.y - dragStartSceneY,
				});
				return;
			}
			hasManualNavigation = true;
			pressedAction = null;
			setView(zoom.value, dragStartPanX + dx, dragStartPanY + dy);
			return;
		}

		if (pointerId === null) {
			const scenePoint = clientPointToScenePoint(event.clientX, event.clientY);
			const targetAction = readAction(event.target);
			performAction({
				type: "hover",
				targetAction: targetAction
					? {
							...targetAction,
							sceneX: scenePoint.x,
							sceneY: scenePoint.y,
						}
					: null,
			});
			return;
		}

		if (event.pointerId !== pointerId) return;
		const dx = event.clientX - dragStartX;
		const dy = event.clientY - dragStartY;
		if (!isDragging && Math.hypot(dx, dy) < EDITOR_2D_DRAG_THRESHOLD) {
			return;
		}
		isDragging = true;
		if (pressedAction?.dragBehavior) {
			const scenePoint = clientPointToScenePoint(event.clientX, event.clientY);
			performAction({
				...pressedAction,
				phase: "move",
				sceneX: scenePoint.x,
				sceneY: scenePoint.y,
				sceneDX: scenePoint.x - dragStartSceneX,
				sceneDY: scenePoint.y - dragStartSceneY,
			});
			return;
		}
		hasManualNavigation = true;
		pressedAction = null;
		setView(zoom.value, dragStartPanX + dx, dragStartPanY + dy);
	};

	const onPointerFinish = (event) => {
		if (event.pointerType === "touch") {
			activeTouches.delete(event.pointerId);
			if (event.isTrusted) {
				event.currentTarget?.releasePointerCapture?.(event.pointerId);
			}
			if (event.pointerId === pointerId && !gestureActive) {
				if (pressedAction?.dragBehavior && isDragging) {
					const scenePoint = clientPointToScenePoint(
						event.clientX,
						event.clientY,
					);
					performAction({
						...pressedAction,
						phase: "end",
						sceneX: scenePoint.x,
						sceneY: scenePoint.y,
						sceneDX: scenePoint.x - dragStartSceneX,
						sceneDY: scenePoint.y - dragStartSceneY,
					});
				} else if (!isDragging) {
					if (pressedAction?.dragBehavior) {
						performAction({
							...pressedAction,
							phase: "cancel",
							sceneX: dragStartSceneX,
							sceneY: dragStartSceneY,
							sceneDX: 0,
							sceneDY: 0,
						});
					}
					performPressedAction();
				}
			}
			if (activeTouches.size >= 2) {
				pressedAction = null;
				gestureActive = true;
				beginTouchGesture();
				return;
			}
			if (activeTouches.size === 1) {
				const [remainingPoint] = activeTouches.values();
				gestureActive = false;
				startPointerSession(
					remainingPoint.pointerId,
					remainingPoint.clientX,
					remainingPoint.clientY,
					null,
				);
				return;
			}
			gestureActive = false;
			finishPointerSession();
			return;
		}

		if (event.pointerId !== pointerId) return;
		if (pressedAction?.dragBehavior && isDragging) {
			const scenePoint = clientPointToScenePoint(event.clientX, event.clientY);
			performAction({
				...pressedAction,
				phase: "end",
				sceneX: scenePoint.x,
				sceneY: scenePoint.y,
				sceneDX: scenePoint.x - dragStartSceneX,
				sceneDY: scenePoint.y - dragStartSceneY,
			});
		} else if (!isDragging && !panOnlyPointer) {
			if (pressedAction?.dragBehavior) {
				performAction({
					...pressedAction,
					phase: "cancel",
					sceneX: dragStartSceneX,
					sceneY: dragStartSceneY,
					sceneDX: 0,
					sceneDY: 0,
				});
			}
			performPressedAction();
		}
		finishPointerSession();
		if (event.isTrusted) {
			event.currentTarget?.releasePointerCapture?.(event.pointerId);
		}
	};

	const onWheel = (event) => {
		event.preventDefault();
		showHint.value = false;
		hasManualNavigation = true;
		setViewFromAnchor({
			nextZoom: zoom.value * Math.exp(-event.deltaY * 0.0015),
			anchorClientX: event.clientX,
			anchorClientY: event.clientY,
		});
	};

	const onPointerLeave = () => {
		if (pointerId !== null || activeTouches.size) return;
		performAction({ type: "hover", targetAction: null });
	};

	const onContextMenu = (event) => {
		event.preventDefault();
		showHint.value = false;
		const action = readAction(event.target);
		if (action?.placementId) {
			performAction({
				type: "remove-placement",
				placementId: action.placementId,
			});
			return;
		}
		if (!action || action.type === "place-tile") {
			performAction({ type: "empty-space" });
		}
	};

	const onAuxClick = (event) => {
		if (event.button === 1) event.preventDefault();
	};

	const onKeyDown = (event) => {
		if (isEditableElement(event.target)) return;
		if (event.key === " " || event.key === "Spacebar" || event.code === "Space") {
			event.preventDefault();
			showHint.value = false;
			performAction({ type: "rotate-active" });
			return;
		}
		if (event.key !== "Backspace" && event.key !== "Delete") return;
		event.preventDefault();
		showHint.value = false;
		performAction({ type: "remove-selected" });
	};

	window.addEventListener("keydown", onKeyDown);
	onDispose(() => window.removeEventListener("keydown", onKeyDown));

	return {
		showHint,
		attachViewport,
		onPointerDown,
		onPointerMove,
		onPointerFinish,
		onPointerLeave,
		onWheel,
		onContextMenu,
		onAuxClick,
		svgViewBox,
		svgPreserveAspectRatio,
		svgWidth,
		svgHeight,
		svgClass,
		svgStyle,
		sceneTransform,
	};
}
