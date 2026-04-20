import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { refurbish } from 'refurbish/vite'

export default defineConfig({
	plugins: [tailwindcss(), refurbish()].filter(Boolean),
	esbuild: {
		jsx: 'automatic',
		jsxImportSource: 'refui',
    jsxDev: false,
	},
})
