import { $, onDispose, read, signal, watch } from 'refui'

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function mixColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

function colorToCss(rgb, alpha = 1) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

export default function RealtimePreview({ mesh, loading, error, theme }) {
  const meshSig = $(() => read(mesh))
  const loadingSig = $(() => read(loading))
  const errorSig = $(() => read(error))
  const themeSig = $(() => read(theme))
  const showHint = signal(true)

  let hostEl = null
  let canvasEl = null
  let resizeObserver = null
  let rafId = 0
  let width = 0
  let height = 0
  let yaw = -32
  let pitch = 58
  let zoom = 1
  let dragging = false
  let pointerId = null
  let lastX = 0
  let lastY = 0

  function requestDraw() {
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      draw()
    })
  }

  function updateCanvasSize() {
    if (!hostEl || !canvasEl) return
    const rect = hostEl.getBoundingClientRect()
    width = Math.max(1, Math.floor(rect.width))
    height = Math.max(1, Math.floor(rect.height))
    const dpr = window.devicePixelRatio || 1
    canvasEl.width = Math.max(1, Math.floor(width * dpr))
    canvasEl.height = Math.max(1, Math.floor(height * dpr))
    canvasEl.style.width = `${width}px`
    canvasEl.style.height = `${height}px`
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
    if (el) queueMicrotask(updateCanvasSize)
  }

  function resetView() {
    yaw = -32
    pitch = 58
    zoom = 1
    requestDraw()
  }

  function draw() {
    if (!canvasEl || width === 0 || height === 0) return
    const ctx = canvasEl.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const dark = themeSig.value === 'dark'
    const bgTop = dark ? '#0f172a' : '#f8fafc'
    const bgBottom = dark ? '#020617' : '#e2e8f0'
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, bgTop)
    gradient.addColorStop(1, bgBottom)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)

    const meshData = meshSig.value
    if (!meshData) return

    const { positions, indices, bounds } = meshData
    if (!positions || !indices || positions.length < 9 || indices.length < 3) return

    const centerX = (bounds.min[0] + bounds.max[0]) / 2
    const centerY = (bounds.min[1] + bounds.max[1]) / 2
    const centerZ = (bounds.min[2] + bounds.max[2]) / 2
    const cosYaw = Math.cos((yaw * Math.PI) / 180)
    const sinYaw = Math.sin((yaw * Math.PI) / 180)
    const cosPitch = Math.cos((pitch * Math.PI) / 180)
    const sinPitch = Math.sin((pitch * Math.PI) / 180)

    const transformed = new Float32Array((positions.length / 3) * 3)
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i] - centerX
      const y = positions[i + 1] - centerY
      const z = positions[i + 2] - centerZ

      const yawX = x * cosYaw - y * sinYaw
      const yawY = x * sinYaw + y * cosYaw
      const yawZ = z

      const pitchY = yawY * cosPitch - yawZ * sinPitch
      const pitchZ = yawY * sinPitch + yawZ * cosPitch

      transformed[i] = yawX
      transformed[i + 1] = pitchY
      transformed[i + 2] = pitchZ

      if (yawX < minX) minX = yawX
      if (yawX > maxX) maxX = yawX
      if (pitchY < minY) minY = pitchY
      if (pitchY > maxY) maxY = pitchY
    }

    const pad = 28
    const spanX = Math.max(1, maxX - minX)
    const spanY = Math.max(1, maxY - minY)
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY) * zoom
    const offsetX = width / 2 - ((minX + maxX) / 2) * scale
    const offsetY = height / 2 + ((minY + maxY) / 2) * scale

    const baseLight = dark ? [96, 165, 250] : [37, 99, 235]
    const baseDark = dark ? [30, 41, 59] : [191, 219, 254]
    const stroke = dark ? 'rgba(226,232,240,0.14)' : 'rgba(15,23,42,0.08)'
    const shadow = dark ? 'rgba(15,23,42,0.25)' : 'rgba(148,163,184,0.16)'
    const light = [-0.35, -0.4, 0.85]
    const lightLength = Math.hypot(...light) || 1
    const lightDir = light.map((v) => v / lightLength)
    const triangles = []

    for (let i = 0; i < indices.length; i += 3) {
      const ia = indices[i] * 3
      const ib = indices[i + 1] * 3
      const ic = indices[i + 2] * 3

      const ax = transformed[ia]
      const ay = transformed[ia + 1]
      const az = transformed[ia + 2]
      const bx = transformed[ib]
      const by = transformed[ib + 1]
      const bz = transformed[ib + 2]
      const cx = transformed[ic]
      const cy = transformed[ic + 1]
      const cz = transformed[ic + 2]

      const ux = bx - ax
      const uy = by - ay
      const uz = bz - az
      const vx = cx - ax
      const vy = cy - ay
      const vz = cz - az

      let nx = uy * vz - uz * vy
      let ny = uz * vx - ux * vz
      let nz = ux * vy - uy * vx
      const normalLength = Math.hypot(nx, ny, nz) || 1
      nx /= normalLength
      ny /= normalLength
      nz /= normalLength

      const brightness = clamp(0.18 + (nx * lightDir[0] + ny * lightDir[1] + nz * lightDir[2] + 1) * 0.32, 0, 1)
      const fill = colorToCss(mixColor(baseDark, baseLight, brightness))

      triangles.push({
        depth: (az + bz + cz) / 3,
        fill,
        ax: ax * scale + offsetX,
        ay: -ay * scale + offsetY,
        bx: bx * scale + offsetX,
        by: -by * scale + offsetY,
        cx: cx * scale + offsetX,
        cy: -cy * scale + offsetY,
      })
    }

    triangles.sort((a, b) => a.depth - b.depth)

    ctx.save()
    ctx.translate(0, 8)
    ctx.fillStyle = shadow
    for (const tri of triangles) {
      ctx.beginPath()
      ctx.moveTo(tri.ax, tri.ay)
      ctx.lineTo(tri.bx, tri.by)
      ctx.lineTo(tri.cx, tri.cy)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()

    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1

    for (const tri of triangles) {
      ctx.beginPath()
      ctx.moveTo(tri.ax, tri.ay)
      ctx.lineTo(tri.bx, tri.by)
      ctx.lineTo(tri.cx, tri.cy)
      ctx.closePath()
      ctx.fillStyle = tri.fill
      ctx.fill()
      ctx.stroke()
    }
  }

  watch(() => {
    meshSig.value
    loadingSig.value
    errorSig.value
    themeSig.value
    requestDraw()
  })

  onDispose(() => {
    resizeObserver?.disconnect()
    if (rafId) cancelAnimationFrame(rafId)
  })

  const statusText = $(() => {
    if (errorSig.value) return errorSig.value
    if (loadingSig.value && !meshSig.value) return 'Generating preview...'
    if (!meshSig.value) return 'Preview unavailable.'
    return ''
  })

  const statusClass = $(() => {
    if (!statusText.value) return 'hidden'
    const tone = errorSig.value
      ? 'bg-rose-50/95 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-900/60'
      : 'bg-white/90 text-slate-600 border border-slate-200 dark:bg-slate-950/80 dark:text-slate-300 dark:border-slate-700'
    return `pointer-events-none absolute inset-x-4 bottom-4 rounded-xl px-4 py-3 text-sm font-medium backdrop-blur ${tone}`
  })

  const loadingBadgeClass = $(() => loadingSig.value
    ? 'absolute right-4 top-4 rounded-full bg-blue-600 text-white px-3 h-8 text-[11px] font-bold uppercase tracking-wider flex items-center dark:bg-blue-500'
    : 'hidden')

  const hintClass = $(() => showHint.value && meshSig.value
    ? 'absolute left-4 bottom-4 rounded-xl bg-white/85 border border-slate-200 px-3 py-2 text-[11px] font-medium text-slate-500 backdrop-blur dark:bg-slate-950/70 dark:border-slate-700 dark:text-slate-400'
    : 'hidden')

  return (
    <div class="relative h-full w-full overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-950 dark:shadow-[0_24px_80px_rgba(2,6,23,0.6)]">
      <div class="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-4">
        <div>
          <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-blue-600/80 dark:text-blue-300/80">Realtime</div>
          <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">Mesh Preview</div>
        </div>
        <button
          class="rounded-xl border border-slate-200 bg-white/90 px-3 h-9 text-xs font-bold text-slate-600 backdrop-blur hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-slate-600"
          on:click={resetView}
        >
          Reset View
        </button>
      </div>

      <div class="absolute inset-0" $ref={attachHost}>
        <canvas
          class="absolute inset-0 h-full w-full touch-none"
          style="cursor: grab;"
          $ref={attachCanvas}
          on:pointerdown={(event) => {
            dragging = true
            pointerId = event.pointerId
            lastX = event.clientX
            lastY = event.clientY
            showHint.value = false
            canvasEl?.setPointerCapture?.(event.pointerId)
          }}
          on:pointermove={(event) => {
            if (!dragging || event.pointerId !== pointerId) return
            const dx = event.clientX - lastX
            const dy = event.clientY - lastY
            lastX = event.clientX
            lastY = event.clientY
            yaw += dx * 0.45
            pitch = clamp(pitch - dy * 0.35, 8, 88)
            requestDraw()
          }}
          on:pointerup={(event) => {
            if (event.pointerId !== pointerId) return
            dragging = false
            pointerId = null
            canvasEl?.releasePointerCapture?.(event.pointerId)
          }}
          on:pointercancel={(event) => {
            if (event.pointerId !== pointerId) return
            dragging = false
            pointerId = null
            canvasEl?.releasePointerCapture?.(event.pointerId)
          }}
          on:wheel={(event) => {
            event.preventDefault()
            showHint.value = false
            zoom = clamp(zoom * Math.exp(-event.deltaY * 0.001), 0.45, 3.2)
            requestDraw()
          }}
        />
      </div>

      <div class={loadingBadgeClass}>Updating...</div>
      <div class={hintClass}>Drag to orbit. Wheel to zoom.</div>
      <div class={statusClass}>{statusText}</div>
    </div>
  )
}
