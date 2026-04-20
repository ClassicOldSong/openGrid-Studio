import { renderDirectPreviewMesh, renderDirectStl, warmDirectStl } from './direct-stl.js'

self.onmessage = async ({ data }) => {
  if (data?.type === 'warmup') {
    await Promise.allSettled([warmDirectStl()])
    return
  }

  if (data?.type === 'preview-mesh') {
    try {
      const preview = await renderDirectPreviewMesh(data.config)
      self.postMessage({
        id: data.id,
        ok: true,
        mesh: preview.mesh,
        logs: preview.logs,
      }, [preview.mesh.positions.buffer, preview.mesh.indices.buffer])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      self.postMessage({ id: data.id, ok: false, error: message })
    }
    return
  }

  if (data?.type !== 'render-stl') return

  try {
    if (!data.config) throw new Error('No export configuration provided.')
    const rendered = await renderDirectStl(data.config)
    self.postMessage({
      id: data.id,
      ok: true,
      stl: rendered.stl.buffer,
      logs: rendered.logs,
    }, [rendered.stl.buffer])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    self.postMessage({ id: data.id, ok: false, error: message })
  }
}
