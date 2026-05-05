import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, rspack } from "@rsbuild/core";
import { Refurbish } from "refurbish/webpack";
import tailwindcss from "@tailwindcss/postcss";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: __dirname,
	source: {
		entry: {
			index: "./src/main.jsx",
		},
	},
	html: {
		template: "./index.html",
	},
	output: {
		distPath: {
			root: "dist",
			js: "assets",
			jsAsync: "assets",
			css: "assets",
			cssAsync: "assets",
			wasm: "assets",
			image: "assets",
			svg: "assets",
			font: "assets",
			media: "assets",
			assets: "assets",
		},
		sourceMap: {
			js: process.env.NODE_ENV === "production" ? false : "cheap-module-source-map",
			css: false,
		},
	},
	server: {
		host: "127.0.0.1",
		historyApiFallback: true,
		publicDir: {
			name: "public",
			copyOnBuild: true,
		},
	},
	dev: {
		hmr: true,
		lazyCompilation: false,
	},
	tools: {
		postcss: {
			postcssOptions: {
				plugins: [tailwindcss()],
			},
		},
		swc(config) {
			config.jsc ??= {};
			config.jsc.transform ??= {};
			config.jsc.transform.react = {
				...(config.jsc.transform.react ?? {}),
				runtime: "automatic",
				importSource: "refui",
				development: false,
				throwIfNamespace: false,
			};
		},
		rspack(config, { isProd }) {
			config.experiments ??= {};
			config.experiments.asyncWebAssembly = true;
			config.watchOptions = {
				aggregateTimeout: 50,
				ignored: /(^|[/\\])(node_modules|dist)([/\\]|$)/,
				poll: 300,
			};
			config.optimization ??= {};
			config.optimization.moduleIds = isProd ? "deterministic" : "named";
			config.optimization.chunkIds = isProd ? "deterministic" : "named";
			config.optimization.runtimeChunk = isProd ? "single" : false;
			config.optimization.splitChunks = isProd
				? {
						chunks: "all",
					}
				: false;
			config.plugins.unshift(
				new Refurbish({
					include: ["src/**/*.js", "src/**/*.jsx"],
					exclude: ["src/**/*worker.js"],
				}),
			);
			config.plugins.push(
				new rspack.NormalModuleReplacementPlugin(
					/^node:fs\/promises$/,
					path.resolve(__dirname, "src/shims/node-fs-promises.js"),
				),
				new rspack.NormalModuleReplacementPlugin(
					/^node:module$/,
					path.resolve(__dirname, "src/shims/node-module.js"),
				),
				new rspack.NormalModuleReplacementPlugin(
					/^node:url$/,
					path.resolve(__dirname, "src/shims/node-url.js"),
				),
			);
		},
	},
});
