import { defineConfig } from 'vite'
import { refurbish } from 'refurbish/vite'

export default defineConfig({
	plugins: [refurbish()].filter(Boolean),
	esbuild: {
		jsx: 'automatic',
		jsxImportSource: 'refui',
    jsxDev: false,
	},
})
