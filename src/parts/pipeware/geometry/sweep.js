export function buildSweepMesh(Manifold, Mesh, triangulate, profile, stations) {
	if (stations.length < 2 || profile.length < 3) return null;
	return buildVariableProfileSweepMesh(
		Manifold,
		Mesh,
		triangulate,
		stations.map(() => profile),
		stations,
	);
}

export function buildVariableProfileSweepMesh(
	Manifold,
	Mesh,
	triangulate,
	profiles,
	stations,
) {
	if (stations.length < 2 || profiles.length !== stations.length) return null;
	const vertices = [];
	const profileCount = profiles[0]?.length ?? 0;
	if (
		profileCount < 3 ||
		profiles.some((profile) => profile.length !== profileCount)
	) {
		return null;
	}
	for (let stationIndex = 0; stationIndex < stations.length; stationIndex++) {
		const station = stations[stationIndex];
		const profile = profiles[stationIndex];
		for (const [offset, z] of profile) {
			vertices.push(
				station.center[0] + station.normal[0] * offset,
				station.center[1] + station.normal[1] * offset,
				z,
			);
		}
	}

	const triangles = [];
	const stationCount = stations.length;
	for (let stationIndex = 0; stationIndex < stationCount - 1; stationIndex++) {
		const current = stationIndex * profileCount;
		const next = (stationIndex + 1) * profileCount;
		for (let profileIndex = 0; profileIndex < profileCount; profileIndex++) {
			const profileNext = (profileIndex + 1) % profileCount;
			const a = current + profileIndex;
			const b = next + profileIndex;
			const c = next + profileNext;
			const d = current + profileNext;
			triangles.push(a, c, b, a, d, c);
		}
	}

	const capTriangles = triangulate([profiles[0]]);
	for (const triangle of capTriangles) {
		triangles.push(triangle[2], triangle[1], triangle[0]);
	}
	const endOffset = (stationCount - 1) * profileCount;
	for (const triangle of capTriangles) {
		triangles.push(
			endOffset + triangle[0],
			endOffset + triangle[1],
			endOffset + triangle[2],
		);
	}

	return Manifold.ofMesh(
		new Mesh({
			numProp: 3,
			vertProperties: new Float32Array(vertices),
			triVerts: new Uint32Array(triangles),
		}),
	);
}
