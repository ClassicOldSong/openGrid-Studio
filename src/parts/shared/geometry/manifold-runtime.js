import ManifoldModule from "manifold-3d/manifold";

let manifoldPromise = null;

export async function getManifoldApi() {
	if (!manifoldPromise) {
		manifoldPromise = ManifoldModule().then((module) => {
			module.setup();
			return module;
		});
	}
	return await manifoldPromise;
}

export async function warmManifoldRuntime() {
	await getManifoldApi();
}
