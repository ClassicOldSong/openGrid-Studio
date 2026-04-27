import path from "node:path";
import { fileURLToPath } from "node:url";
import rspack from "@rspack/core";
import { Refurbish } from "refurbish/webpack";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";

export default {
	context: __dirname,
	entry: {
		index: "./src/main.jsx",
	},
	output: {
		path: path.resolve(__dirname, "dist"),
		filename: "assets/[name]-[contenthash:8].js",
		chunkFilename: "assets/[name]-[contenthash:8].js",
		assetModuleFilename: "assets/[name]-[contenthash:8][ext]",
		clean: true,
	},
	resolve: {
		extensions: [".js", ".jsx", ".json"],
	},
	module: {
		rules: [
			{
				test: /\.[cm]?jsx?$/,
				exclude: /node_modules/,
				loader: "builtin:swc-loader",
				options: {
					jsc: {
						parser: {
							syntax: "ecmascript",
							jsx: true,
						},
						transform: {
							react: {
								runtime: "automatic",
								importSource: "refui",
								development: false,
								throwIfNamespace: false,
							},
						},
					},
				},
			},
			{
				test: /\.css$/i,
				use: [
					"style-loader",
					"css-loader",
					{
						loader: "postcss-loader",
						options: {
							postcssOptions: {
								plugins: ["@tailwindcss/postcss"],
							},
						},
					},
				],
				type: "javascript/auto",
			},
			{
				test: /\.wasm$/i,
				type: "asset/resource",
			},
		],
	},
	plugins: [
		new Refurbish({
			include: ["**/*.jsx"],
		}),
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
		new rspack.HtmlRspackPlugin({
			template: "./index.html",
			filename: "index.html",
		}),
		new rspack.CopyRspackPlugin({
			patterns: [
				{
					from: path.resolve(__dirname, "public"),
					to: path.resolve(__dirname, "dist"),
					noErrorOnMissing: true,
				},
			],
		}),
	],
	experiments: {
		asyncWebAssembly: true,
	},
	devtool: isProduction ? false : "cheap-module-source-map",
	devServer: {
		host: "127.0.0.1",
		hot: true,
		historyApiFallback: true,
		static: {
			directory: path.resolve(__dirname, "public"),
			publicPath: "/",
		},
	},
	optimization: {
		moduleIds: "deterministic",
		chunkIds: "deterministic",
		runtimeChunk: "single",
		splitChunks: {
			chunks: "all",
		},
	},
};
