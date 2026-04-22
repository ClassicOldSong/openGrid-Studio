import { $, onDispose, read, signal, watch } from 'refui'

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value))
}

function vecDot(a, b) {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function vecCross(a, b) {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function vecLength(v) {
	return Math.hypot(v[0], v[1], v[2])
}

function vecNormalize(v) {
	const length = vecLength(v) || 1
	return [v[0] / length, v[1] / length, v[2] / length]
}

function quatNormalize(q) {
	const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1
	return [q[0] / length, q[1] / length, q[2] / length, q[3] / length]
}

function quatMultiply(a, b) {
	return [
		a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
		a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
		a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
		a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
	]
}

function quatConjugate(q) {
	return [-q[0], -q[1], -q[2], q[3]]
}

function quatRotateVec(q, v) {
	const u = [q[0], q[1], q[2]]
	const uv = vecCross(u, v)
	const uuv = vecCross(u, uv)
	return [v[0] + 2 * (q[3] * uv[0] + uuv[0]), v[1] + 2 * (q[3] * uv[1] + uuv[1]), v[2] + 2 * (q[3] * uv[2] + uuv[2])]
}

function quatFromAxisAngle(axis, angle) {
	const normalized = vecNormalize(axis)
	const half = angle / 2
	const sinHalf = Math.sin(half)
	return quatNormalize([normalized[0] * sinHalf, normalized[1] * sinHalf, normalized[2] * sinHalf, Math.cos(half)])
}

function quatFromUnitVectors(a, b) {
	const dot = clamp(vecDot(a, b), -1, 1)
	if (dot < -0.999999) {
		let axis = vecCross([1, 0, 0], a)
		if (vecLength(axis) < 1e-6) axis = vecCross([0, 1, 0], a)
		return quatFromAxisAngle(axis, Math.PI)
	}

	const cross = vecCross(a, b)
	return quatNormalize([cross[0], cross[1], cross[2], 1 + dot])
}

function quatToMat3(q) {
	const basisX = quatRotateVec(q, [1, 0, 0])
	const basisY = quatRotateVec(q, [0, 1, 0])
	const basisZ = quatRotateVec(q, [0, 0, 1])
	return new Float32Array([
		basisX[0],
		basisX[1],
		basisX[2],
		basisY[0],
		basisY[1],
		basisY[2],
		basisZ[0],
		basisZ[1],
		basisZ[2]
	])
}

function createShader(gl, type, source) {
	const shader = gl.createShader(type)
	if (!shader) throw new Error('Failed to create shader.')
	gl.shaderSource(shader, source)
	gl.compileShader(shader)
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const message = gl.getShaderInfoLog(shader) || 'Shader compilation failed.'
		gl.deleteShader(shader)
		throw new Error(message)
	}
	return shader
}

function createProgram(gl) {
	const vertexShader = createShader(
		gl,
		gl.VERTEX_SHADER,
		`
    attribute vec3 aPosition;
    attribute vec3 aNormal;

    uniform mat3 uRotation;
    uniform vec3 uTranslation;
    uniform vec3 uClipScale;

    varying float vLight;

    void main() {
      vec3 viewPos = uRotation * (aPosition - uTranslation);
      vec3 viewNormal = normalize(uRotation * aNormal);
      vec3 lightDir = normalize(vec3(-0.55, -0.42, 0.72));
      vLight = max(dot(viewNormal, lightDir), 0.0);
      gl_Position = vec4(
        viewPos.x * uClipScale.x,
        viewPos.y * uClipScale.y,
        -viewPos.z * uClipScale.z,
        1.0
      );
    }
  `
	)

	const fragmentShader = createShader(
		gl,
		gl.FRAGMENT_SHADER,
		`
    precision mediump float;

    uniform vec3 uBaseDark;
    uniform vec3 uBaseLight;
    varying float vLight;

    void main() {
      float brightness = clamp(0.18 + vLight * 0.72, 0.0, 1.0);
      vec3 color = mix(uBaseDark, uBaseLight, brightness);
      gl_FragColor = vec4(color, 1.0);
    }
  `
	)

	const program = gl.createProgram()
	if (!program) throw new Error('Failed to create program.')
	gl.attachShader(program, vertexShader)
	gl.attachShader(program, fragmentShader)
	gl.linkProgram(program)
	gl.deleteShader(vertexShader)
	gl.deleteShader(fragmentShader)

	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const message = gl.getProgramInfoLog(program) || 'Program linking failed.'
		gl.deleteProgram(program)
		throw new Error(message)
	}

	return {
		program,
		attributes: {
			position: gl.getAttribLocation(program, 'aPosition'),
			normal: gl.getAttribLocation(program, 'aNormal')
		},
		uniforms: {
			rotation: gl.getUniformLocation(program, 'uRotation'),
			translation: gl.getUniformLocation(program, 'uTranslation'),
			clipScale: gl.getUniformLocation(program, 'uClipScale'),
			baseDark: gl.getUniformLocation(program, 'uBaseDark'),
			baseLight: gl.getUniformLocation(program, 'uBaseLight')
		}
	}
}

const DEFAULT_YAW = 146
const DEFAULT_PITCH = 34
const MIN_ZOOM = 0.35
const MAX_ZOOM = 4.5
const AUTO_FIT_PADDING = 1.12

function defaultRotation() {
	const yaw = quatFromAxisAngle([0, 0, 1], (DEFAULT_YAW * Math.PI) / 180)
	const pitch = quatFromAxisAngle([1, 0, 0], (DEFAULT_PITCH * Math.PI) / 180)
	const roll = quatFromAxisAngle([0, 0, 1], Math.PI)
	return quatNormalize(quatMultiply(roll, quatMultiply(pitch, yaw)))
}

export default function RealtimePreview({ mesh, loading, error, theme }) {
	const meshSig = $(() => read(mesh))
	const loadingSig = $(() => read(loading))
	const errorSig = $(() => read(error))
	const themeSig = $(() => read(theme))
	const rendererError = signal('')
	const showHint = signal(true)

	let hostEl = null
	let canvasEl = null
	let resizeObserver = null
	let rafId = 0
	let width = 0
	let height = 0
	let rotation = defaultRotation()
	let zoom = 1
	let focusX = 0
	let focusY = 0
	let focusZ = 0
	let fitScale = 1
	let panScaleX = 1
	let panScaleY = 1
	let dragging = false
	let pointerId = null
	let dragMode = 'orbit'
	let dragStartX = 0
	let dragStartY = 0
	let dragStartFocus = [0, 0, 0]
	let dragStartRight = [1, 0, 0]
	let dragStartUp = [0, 1, 0]
	let dragStartScaleX = 1
	let dragStartScaleY = 1
	let dragLastArcball = [0, 0, 1]
	let gestureStartDistance = 1
	let gestureStartZoom = 1
	let gestureStartCenterX = 0
	let gestureStartCenterY = 0
	const activeTouchPoints = new Map()

	let gl = null
	let glProgram = null
	let positionBuffer = null
	let normalBuffer = null
	let vertexCount = 0
	let sceneCenter = [0, 0, 0]
	let sceneRadius = 1
	let sceneBoundsCorners = []
	let pendingAutoFit = false
	let hasAutoFit = false

	function requestDraw() {
		if (rafId) return
		rafId = requestAnimationFrame(() => {
			rafId = 0
			draw()
		})
	}

	function currentPixelRatio() {
		const triangleCount = (meshSig.value?.indices?.length ?? 0) / 3
		const cap = triangleCount > 25000 ? 1 : triangleCount > 12000 ? 1.25 : 1.5
		return Math.min(window.devicePixelRatio || 1, cap)
	}

	function updateCanvasSize() {
		if (!hostEl || !canvasEl) return
		const rect = hostEl.getBoundingClientRect()
		width = Math.max(1, Math.floor(rect.width))
		height = Math.max(1, Math.floor(rect.height))
		const dpr = currentPixelRatio()
		canvasEl.width = Math.max(1, Math.floor(width * dpr))
		canvasEl.height = Math.max(1, Math.floor(height * dpr))
		canvasEl.style.width = `${width}px`
		canvasEl.style.height = `${height}px`
		if (pendingAutoFit && vertexCount > 0) {
			fitView({ resetRotation: false })
			return
		}
		requestDraw()
	}

	function initGl(canvas) {
		if (gl || !canvas) return
		const context = canvas.getContext('webgl', {
			antialias: true,
			alpha: true,
			depth: true,
			preserveDrawingBuffer: false
		})

		if (!context) {
			rendererError.value = 'WebGL preview is not available in this browser.'
			return
		}

		try {
			gl = context
			glProgram = createProgram(gl)
			positionBuffer = gl.createBuffer()
			normalBuffer = gl.createBuffer()
			if (!positionBuffer || !normalBuffer) throw new Error('Failed to create WebGL buffers.')
			gl.enable(gl.DEPTH_TEST)
			gl.depthFunc(gl.LEQUAL)
			gl.enable(gl.CULL_FACE)
			gl.cullFace(gl.BACK)
			gl.disable(gl.BLEND)
			rendererError.value = ''
		} catch (glError) {
			rendererError.value = glError instanceof Error ? glError.message : String(glError)
			gl = null
			glProgram = null
			positionBuffer = null
			normalBuffer = null
		}
	}

	function destroyGl() {
		if (!gl) return
		if (positionBuffer) gl.deleteBuffer(positionBuffer)
		if (normalBuffer) gl.deleteBuffer(normalBuffer)
		if (glProgram?.program) gl.deleteProgram(glProgram.program)
		gl = null
		glProgram = null
		positionBuffer = null
		normalBuffer = null
		vertexCount = 0
	}

	function uploadMesh(meshData) {
		if (!gl || !glProgram || !positionBuffer || !normalBuffer) return
		if (!meshData?.positions || !meshData?.indices || meshData.indices.length < 3) {
			vertexCount = 0
			sceneBoundsCorners = []
			pendingAutoFit = false
			hasAutoFit = false
			return
		}

		const { positions, indices, bounds } = meshData
		const expandedPositions = new Float32Array(indices.length * 3)
		const expandedNormals = new Float32Array(indices.length * 3)

		for (let i = 0; i < indices.length; i += 3) {
			const ia = indices[i] * 3
			const ib = indices[i + 1] * 3
			const ic = indices[i + 2] * 3
			const dst = i * 3

			const ax = positions[ia]
			const ay = positions[ia + 1]
			const az = positions[ia + 2]
			const bx = positions[ib]
			const by = positions[ib + 1]
			const bz = positions[ib + 2]
			const cx = positions[ic]
			const cy = positions[ic + 1]
			const cz = positions[ic + 2]

			const normal = vecNormalize(vecCross([bx - ax, by - ay, bz - az], [cx - ax, cy - ay, cz - az]))

			expandedPositions.set([ax, ay, az, bx, by, bz, cx, cy, cz], dst)
			expandedNormals.set(
				[normal[0], normal[1], normal[2], normal[0], normal[1], normal[2], normal[0], normal[1], normal[2]],
				dst
			)
		}

		sceneCenter = [
			(bounds.min[0] + bounds.max[0]) / 2,
			(bounds.min[1] + bounds.max[1]) / 2,
			(bounds.min[2] + bounds.max[2]) / 2
		]
		sceneBoundsCorners = [
			[bounds.min[0], bounds.min[1], bounds.min[2]],
			[bounds.min[0], bounds.min[1], bounds.max[2]],
			[bounds.min[0], bounds.max[1], bounds.min[2]],
			[bounds.min[0], bounds.max[1], bounds.max[2]],
			[bounds.max[0], bounds.min[1], bounds.min[2]],
			[bounds.max[0], bounds.min[1], bounds.max[2]],
			[bounds.max[0], bounds.max[1], bounds.min[2]],
			[bounds.max[0], bounds.max[1], bounds.max[2]]
		]
		sceneRadius = Math.max(
			1,
			Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]) / 2
		)

		gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
		gl.bufferData(gl.ARRAY_BUFFER, expandedPositions, gl.STATIC_DRAW)
		gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer)
		gl.bufferData(gl.ARRAY_BUFFER, expandedNormals, gl.STATIC_DRAW)
		vertexCount = indices.length
		pendingAutoFit = !hasAutoFit
	}

	function fitView({ resetRotation } = { resetRotation: true }) {
		if (resetRotation) rotation = defaultRotation()
		focusX = 0
		focusY = 0
		focusZ = 0

		if (!sceneBoundsCorners.length || width === 0 || height === 0) {
			pendingAutoFit = vertexCount > 0
			requestDraw()
			return
		}

		const aspect = width / Math.max(height, 1)
		let maxX = 0
		let maxY = 0

		for (const corner of sceneBoundsCorners) {
			const localCorner = [
				corner[0] - sceneCenter[0],
				corner[1] - sceneCenter[1],
				corner[2] - sceneCenter[2]
			]
			const rotatedCorner = quatRotateVec(rotation, localCorner)
			maxX = Math.max(maxX, Math.abs(rotatedCorner[0]))
			maxY = Math.max(maxY, Math.abs(rotatedCorner[1]))
		}

		const requiredHalfHeight = Math.max(maxY, maxX / Math.max(aspect, 0.0001), 0.0001) * AUTO_FIT_PADDING
		zoom = clamp((sceneRadius * 1.08) / requiredHalfHeight, MIN_ZOOM, MAX_ZOOM)
		pendingAutoFit = false
		hasAutoFit = true
		requestDraw()
	}

	function attachHost(el) {
		hostEl = el
		resizeObserver?.disconnect()
		resizeObserver = null

		if (el && typeof ResizeObserver !== 'undefined') {
			resizeObserver = new ResizeObserver(updateCanvasSize)
			resizeObserver.observe(el)
			queueMicrotask(updateCanvasSize)
		}
	}

	function attachCanvas(el) {
		canvasEl = el
		if (el) {
			initGl(el)
			uploadMesh(meshSig.value)
			queueMicrotask(updateCanvasSize)
		}
	}

	function resetView() {
		fitView({ resetRotation: true })
	}

	function getPanBasis() {
		const inverse = quatConjugate(rotation)
		return {
			right: quatRotateVec(inverse, [1, 0, 0]),
			up: quatRotateVec(inverse, [0, 1, 0])
		}
	}

	function clearDragState() {
		dragging = false
		pointerId = null
		dragMode = 'orbit'
		if (canvasEl) canvasEl.style.cursor = 'grab'
	}

	function beginPanBaseline() {
		dragStartFocus = [focusX, focusY, focusZ]
		dragStartScaleX = panScaleX
		dragStartScaleY = panScaleY
		const basis = getPanBasis()
		dragStartRight = basis.right
		dragStartUp = basis.up
	}

	function beginTouchOrbit(point) {
		if (!point) {
			clearDragState()
			return
		}
		dragging = true
		pointerId = point.pointerId
		dragMode = 'orbit'
		dragLastArcball = projectArcball(point.clientX, point.clientY)
	}

	function beginTouchGesture() {
		const points = [...activeTouchPoints.values()]
		if (points.length < 2) return
		const [a, b] = points
		dragging = true
		pointerId = null
		dragMode = 'touch'
		beginPanBaseline()
		gestureStartZoom = zoom
		gestureStartCenterX = (a.clientX + b.clientX) / 2
		gestureStartCenterY = (a.clientY + b.clientY) / 2
		gestureStartDistance = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY))
	}

	function updateTouchGesture() {
		const points = [...activeTouchPoints.values()]
		if (points.length >= 2) {
			if (dragMode !== 'touch') beginTouchGesture()
			const [a, b] = points
			const centerX = (a.clientX + b.clientX) / 2
			const centerY = (a.clientY + b.clientY) / 2
			const totalDx = centerX - gestureStartCenterX
			const totalDy = centerY - gestureStartCenterY
			focusX =
				dragStartFocus[0] +
				dragStartRight[0] * (-totalDx * dragStartScaleX) +
				dragStartUp[0] * (totalDy * dragStartScaleY)
			focusY =
				dragStartFocus[1] +
				dragStartRight[1] * (-totalDx * dragStartScaleX) +
				dragStartUp[1] * (totalDy * dragStartScaleY)
			focusZ =
				dragStartFocus[2] +
				dragStartRight[2] * (-totalDx * dragStartScaleX) +
				dragStartUp[2] * (totalDy * dragStartScaleY)
			const currentDistance = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY))
			zoom = clamp((gestureStartZoom * currentDistance) / gestureStartDistance, MIN_ZOOM, MAX_ZOOM)
			requestDraw()
			return
		}

		if (points.length === 1) {
			const point = points[0]
			if (dragMode !== 'orbit' || pointerId !== point.pointerId) {
				beginTouchOrbit(point)
			} else {
				const currentArcball = projectArcball(point.clientX, point.clientY)
				const delta = quatFromUnitVectors(dragLastArcball, currentArcball)
				rotation = quatNormalize(quatMultiply(delta, rotation))
				dragLastArcball = currentArcball
				requestDraw()
			}
			return
		}

		clearDragState()
	}

	function projectArcball(clientX, clientY) {
		if (!hostEl) return [0, 0, 1]
		const rect = hostEl.getBoundingClientRect()
		const radius = Math.max(1, Math.min(width, height) * 0.45)
		const x = (clientX - rect.left - width / 2) / radius
		const y = (height / 2 - (clientY - rect.top)) / radius
		const distance = x * x + y * y
		// Use the classic sphere-to-hyperbolic-sheet blend with a continuous join.
		const z = distance <= 0.5 ? Math.sqrt(1 - distance) : 0.5 / Math.sqrt(distance)
		return vecNormalize([x, y, z])
	}

	function draw() {
		if (!gl || !glProgram || !canvasEl || width === 0 || height === 0) return

		gl.viewport(0, 0, canvasEl.width, canvasEl.height)
		gl.clearColor(0, 0, 0, 0)
		gl.clearDepth(1)
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

		if (vertexCount === 0) return

		const aspect = width / Math.max(height, 1)
		const halfHeight = (sceneRadius / zoom) * 1.08
		const halfWidth = halfHeight * aspect
		fitScale = Math.min(width / Math.max(halfWidth * 2, 1), height / Math.max(halfHeight * 2, 1))
		panScaleX = (halfWidth * 2) / Math.max(width, 1)
		panScaleY = (halfHeight * 2) / Math.max(height, 1)

		const dark = themeSig.value === 'dark'
		const baseLight = dark ? [96 / 255, 165 / 255, 250 / 255] : [37 / 255, 99 / 255, 235 / 255]
		const baseDark = dark ? [30 / 255, 41 / 255, 59 / 255] : [191 / 255, 219 / 255, 254 / 255]
		const rotationMatrix = quatToMat3(rotation)
		const translation = new Float32Array([sceneCenter[0] + focusX, sceneCenter[1] + focusY, sceneCenter[2] + focusZ])
		const clipScale = new Float32Array([
			1 / Math.max(halfWidth, 0.0001),
			1 / Math.max(halfHeight, 0.0001),
			1 / Math.max(sceneRadius * 2.2, 0.0001)
		])

		gl.useProgram(glProgram.program)

		gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
		gl.enableVertexAttribArray(glProgram.attributes.position)
		gl.vertexAttribPointer(glProgram.attributes.position, 3, gl.FLOAT, false, 0, 0)

		gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer)
		gl.enableVertexAttribArray(glProgram.attributes.normal)
		gl.vertexAttribPointer(glProgram.attributes.normal, 3, gl.FLOAT, false, 0, 0)

		gl.uniformMatrix3fv(glProgram.uniforms.rotation, false, rotationMatrix)
		gl.uniform3fv(glProgram.uniforms.translation, translation)
		gl.uniform3fv(glProgram.uniforms.clipScale, clipScale)
		gl.uniform3fv(glProgram.uniforms.baseDark, new Float32Array(baseDark))
		gl.uniform3fv(glProgram.uniforms.baseLight, new Float32Array(baseLight))

		gl.drawArrays(gl.TRIANGLES, 0, vertexCount)
	}

	watch(() => {
		const mesh = meshSig.value
		const shouldAutoFit = !hasAutoFit && !!mesh?.indices?.length
		queueMicrotask(() => {
			if (gl) uploadMesh(mesh)
			if (shouldAutoFit) fitView({ resetRotation: true })
			updateCanvasSize()
			requestDraw()
		})
	})

	watch(() => {
		loadingSig.value
		errorSig.value
		themeSig.value
		requestDraw()
	})

	onDispose(() => {
		resizeObserver?.disconnect()
		if (rafId) cancelAnimationFrame(rafId)
		destroyGl()
	})

	const statusText = $(() => {
		if (rendererError.value) return rendererError.value
		if (errorSig.value) return errorSig.value
		if (loadingSig.value) return 'Generating preview...'
		if (!meshSig.value) return '3D preview is empty.'
		return ''
	})

	const statusClass = $(() => {
		if (!statusText.value) return 'hidden'
		const tone =
			rendererError.value || errorSig.value
				? 'bg-rose-50/95 text-rose-700 border border-rose-200 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-900/60'
				: 'bg-white/90 text-slate-600 border border-slate-200 dark:bg-slate-950/80 dark:text-slate-300 dark:border-slate-700'
		return `mt-3 inline-flex rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] backdrop-blur ${tone}`
	})

	const resetButtonClass = $(() =>
		loadingSig.value
			? 'rounded-xl border border-slate-200 bg-white/60 px-3 h-9 text-xs font-bold text-slate-400 backdrop-blur dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-500'
			: 'rounded-xl border border-slate-200 bg-white/90 px-3 h-9 text-xs font-bold text-slate-600 backdrop-blur hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-slate-600'
	)

	const hintClass = $(() =>
		showHint.value && meshSig.value
			? 'absolute right-4 bottom-4 rounded-xl bg-white/85 border border-slate-200 px-3 py-2 text-[11px] font-medium text-slate-500 backdrop-blur dark:bg-slate-950/70 dark:border-slate-700 dark:text-slate-400'
			: 'hidden'
	)

	const backgroundStyle = $(() =>
		themeSig.value === 'dark'
			? 'background: linear-gradient(180deg, #0f172a 0%, #020617 100%);'
			: 'background: linear-gradient(180deg, #f8fafc 0%, #dbeafe 100%);'
	)

	return (
		<div class="relative h-full w-full overflow-hidden bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:bg-slate-950 dark:shadow-[0_24px_80px_rgba(2,6,23,0.6)]">
			<div class="absolute inset-0" style={backgroundStyle}></div>

			<div class="absolute inset-x-0 top-0 z-10 flex items-start justify-between px-4 py-4">
				<div class="pointer-events-none">
					<div class="text-[10px] font-bold uppercase tracking-[0.24em] text-blue-600/80 dark:text-blue-300/80">
						Viewport
					</div>
					<div class="text-sm font-semibold text-slate-800 dark:text-slate-100">3D Preview</div>
					<div class={statusClass}>{statusText}</div>
				</div>
				<button class={resetButtonClass} on:click={resetView}>
					Reset View
				</button>
			</div>

			<div class="absolute inset-0" $ref={attachHost}>
				<canvas
					class="absolute inset-0 h-full w-full touch-none"
					style="cursor: grab;"
					$ref={attachCanvas}
					on:contextmenu={(event) => event.preventDefault()}
					on:pointerdown={(event) => {
						showHint.value = false
						if (event.pointerType === 'touch') {
							event.preventDefault()
							activeTouchPoints.set(event.pointerId, {
								pointerId: event.pointerId,
								clientX: event.clientX,
								clientY: event.clientY
							})
							canvasEl?.setPointerCapture?.(event.pointerId)
							updateTouchGesture()
							return
						}

						dragging = true
						pointerId = event.pointerId
						dragMode = event.button === 1 || event.button === 2 || event.shiftKey ? 'pan' : 'orbit'
						dragStartX = event.clientX
						dragStartY = event.clientY
						beginPanBaseline()
						dragLastArcball = projectArcball(event.clientX, event.clientY)
						if (canvasEl) canvasEl.style.cursor = dragMode === 'pan' ? 'move' : 'grabbing'
						canvasEl?.setPointerCapture?.(event.pointerId)
					}}
					on:pointermove={(event) => {
						if (event.pointerType === 'touch') {
							if (!activeTouchPoints.has(event.pointerId)) return
							activeTouchPoints.set(event.pointerId, {
								pointerId: event.pointerId,
								clientX: event.clientX,
								clientY: event.clientY
							})
							updateTouchGesture()
							return
						}

						if (!dragging || event.pointerId !== pointerId) return

						if (dragMode === 'pan') {
							const totalDx = event.clientX - dragStartX
							const totalDy = event.clientY - dragStartY
							focusX =
								dragStartFocus[0] +
								dragStartRight[0] * (-totalDx * dragStartScaleX) +
								dragStartUp[0] * (totalDy * dragStartScaleY)
							focusY =
								dragStartFocus[1] +
								dragStartRight[1] * (-totalDx * dragStartScaleX) +
								dragStartUp[1] * (totalDy * dragStartScaleY)
							focusZ =
								dragStartFocus[2] +
								dragStartRight[2] * (-totalDx * dragStartScaleX) +
								dragStartUp[2] * (totalDy * dragStartScaleY)
						} else {
							const currentArcball = projectArcball(event.clientX, event.clientY)
							const delta = quatFromUnitVectors(dragLastArcball, currentArcball)
							rotation = quatNormalize(quatMultiply(delta, rotation))
							dragLastArcball = currentArcball
						}

						requestDraw()
					}}
					on:pointerup={(event) => {
						if (event.pointerType === 'touch') {
							activeTouchPoints.delete(event.pointerId)
							canvasEl?.releasePointerCapture?.(event.pointerId)
							updateTouchGesture()
							return
						}

						if (event.pointerId !== pointerId) return
						clearDragState()
						canvasEl?.releasePointerCapture?.(event.pointerId)
					}}
					on:pointerleave={(event) => {
						if (event.pointerType === 'touch' || !dragging || event.pointerId !== pointerId) return
						clearDragState()
						canvasEl?.releasePointerCapture?.(event.pointerId)
					}}
					on:pointercancel={(event) => {
						if (event.pointerType === 'touch') {
							activeTouchPoints.delete(event.pointerId)
							canvasEl?.releasePointerCapture?.(event.pointerId)
							updateTouchGesture()
							return
						}

						if (event.pointerId !== pointerId) return
						clearDragState()
						canvasEl?.releasePointerCapture?.(event.pointerId)
					}}
					on:wheel={(event) => {
						event.preventDefault()
						showHint.value = false
						zoom = clamp(zoom * Math.exp(-event.deltaY * 0.001), MIN_ZOOM, MAX_ZOOM)
						requestDraw()
					}}
				/>
			</div>

			<div class={hintClass}>Drag to orbit. Two fingers pan and zoom. Shift-drag or right-drag also pans.</div>
		</div>
	)
}
