import { createReadStream, statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIME_TYPES = new Map([
	[".css", "text/css; charset=utf-8"],
	[".html", "text/html; charset=utf-8"],
	[".js", "text/javascript; charset=utf-8"],
	[".json", "application/json; charset=utf-8"],
	[".png", "image/png"],
	[".svg", "image/svg+xml"],
	[".wasm", "application/wasm"],
]);

function parseArgs(argv) {
	const options = {
		host: "127.0.0.1",
		port: 4173,
		root: "dist",
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--host") {
			options.host = argv[++i] ?? options.host;
		} else if (arg === "--port") {
			options.port = Number(argv[++i] ?? options.port);
		} else {
			options.root = arg;
		}
	}
	return options;
}

function sendNotFound(response) {
	response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
	response.end("Not found");
}

const { host, port, root } = parseArgs(process.argv.slice(2));
const cwd = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(cwd, "..", root);

try {
	if (!statSync(rootDir).isDirectory()) {
		throw new Error(`${rootDir} is not a directory.`);
	}
} catch {
	console.error(`Preview root does not exist: ${rootDir}`);
	process.exit(1);
}

const server = createServer(async (request, response) => {
	const url = new URL(request.url ?? "/", `http://${host}:${port}`);
	const pathname = decodeURIComponent(url.pathname);
	const requestedPath = path.resolve(
		rootDir,
		pathname.replace(/^\/+/, "") || "index.html",
	);
	if (!requestedPath.startsWith(rootDir + path.sep) && requestedPath !== rootDir) {
		sendNotFound(response);
		return;
	}

	let filePath = requestedPath;
	try {
		const fileStat = await stat(filePath);
		if (fileStat.isDirectory()) filePath = path.join(filePath, "index.html");
	} catch {
		filePath = path.join(rootDir, "index.html");
	}

	try {
		const fileStat = await stat(filePath);
		if (!fileStat.isFile()) {
			sendNotFound(response);
			return;
		}
		response.writeHead(200, {
			"content-length": fileStat.size,
			"content-type":
				MIME_TYPES.get(path.extname(filePath)) ??
				"application/octet-stream",
		});
		createReadStream(filePath).pipe(response);
	} catch {
		sendNotFound(response);
	}
});

server.listen(port, host, () => {
	console.log(`Preview server running at http://${host}:${port}/`);
});
