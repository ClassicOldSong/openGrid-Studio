import {
	DEFAULT_PART_ID,
	renderPartExport,
	renderPartPreviewMesh,
	warmPartRenderer,
} from "./parts/index.js";

self.onmessage = async ({ data }) => {
	const partId = data?.partId ?? DEFAULT_PART_ID;

	if (data?.type === 'warmup') {
		await Promise.allSettled([warmPartRenderer(partId)])
		return
	}

	if (data?.type === 'preview-mesh') {
		try {
			const preview = await renderPartPreviewMesh(partId, data.config)
			self.postMessage(
				{
					id: data.id,
					ok: true,
					mesh: preview.mesh,
					logs: preview.logs
				},
				[preview.mesh.positions.buffer, preview.mesh.indices.buffer]
			)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			self.postMessage({ id: data.id, ok: false, error: message })
		}
		return
	}

	if (data?.type !== 'render-export' && data?.type !== 'render-stl') return

	try {
		if (!data.config) throw new Error('No export configuration provided.')
		const rendered = await renderPartExport(
			partId,
			data.config,
			data?.type === 'render-stl' ? 'stl-binary' : data.format,
		)
		self.postMessage(
			{
				id: data.id,
				ok: true,
				bytes: rendered.bytes.buffer,
				mimeType: rendered.mimeType,
				extension: rendered.extension,
				logs: rendered.logs
			},
			[rendered.bytes.buffer]
		)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		self.postMessage({ id: data.id, ok: false, error: message })
	}
}
