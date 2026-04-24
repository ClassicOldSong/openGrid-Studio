function getTriangleMesh(manifold) {
	const mesh = manifold.getMesh();
	const triangleCount = mesh.triVerts.length / 3;
	return { mesh, triangleCount };
}

function getTriangleGeometry(mesh, triangleIndex) {
	const i0 = mesh.triVerts[triangleIndex * 3];
	const i1 = mesh.triVerts[triangleIndex * 3 + 1];
	const i2 = mesh.triVerts[triangleIndex * 3 + 2];

	const p0 = mesh.position(i0);
	const p1 = mesh.position(i1);
	const p2 = mesh.position(i2);

	const ux = p1[0] - p0[0];
	const uy = p1[1] - p0[1];
	const uz = p1[2] - p0[2];
	const vx = p2[0] - p0[0];
	const vy = p2[1] - p0[1];
	const vz = p2[2] - p0[2];

	let nx = uy * vz - uz * vy;
	let ny = uz * vx - ux * vz;
	let nz = ux * vy - uy * vx;
	const length = Math.hypot(nx, ny, nz) || 1;
	nx /= length;
	ny /= length;
	nz /= length;

	return { p0, p1, p2, normal: [nx, ny, nz] };
}

export function buildBinaryStl(manifold) {
	return buildBinaryStlFromModels([manifold]);
}

export function buildBinaryStlFromModels(manifolds) {
	const meshes = manifolds.map((manifold) => getTriangleMesh(manifold));
	const triangleCount = meshes.reduce(
		(total, item) => total + item.triangleCount,
		0,
	);
	const buffer = new ArrayBuffer(84 + triangleCount * 50);
	const view = new DataView(buffer);

	view.setUint32(80, triangleCount, true);

	let offset = 84;
	for (const { mesh, triangleCount: meshTriangleCount } of meshes) {
		for (let index = 0; index < meshTriangleCount; index++) {
			const { p0, p1, p2, normal } = getTriangleGeometry(mesh, index);

			view.setFloat32(offset, normal[0], true);
			view.setFloat32(offset + 4, normal[1], true);
			view.setFloat32(offset + 8, normal[2], true);
			offset += 12;

			for (const point of [p0, p1, p2]) {
				view.setFloat32(offset, point[0], true);
				view.setFloat32(offset + 4, point[1], true);
				view.setFloat32(offset + 8, point[2], true);
				offset += 12;
			}

			view.setUint16(offset, 0, true);
			offset += 2;
		}
	}

	return new Uint8Array(buffer);
}

function formatAsciiStlNumber(value) {
	if (Math.abs(value) < 1e-9) return "0";
	return Number(value.toFixed(6)).toString();
}

export function buildAsciiStl(manifold) {
	return buildAsciiStlFromModels([manifold]);
}

export function buildAsciiStlFromModels(manifolds, names = []) {
	const lines = [];

	for (let modelIndex = 0; modelIndex < manifolds.length; modelIndex++) {
		const name = names[modelIndex] ?? `pipeware_part_${modelIndex + 1}`;
		const { mesh, triangleCount } = getTriangleMesh(manifolds[modelIndex]);
		lines.push(`solid ${name}`);
		for (let index = 0; index < triangleCount; index++) {
			const { p0, p1, p2, normal } = getTriangleGeometry(mesh, index);
			lines.push(
				`  facet normal ${formatAsciiStlNumber(normal[0])} ${formatAsciiStlNumber(normal[1])} ${formatAsciiStlNumber(normal[2])}`,
				"    outer loop",
				`      vertex ${formatAsciiStlNumber(p0[0])} ${formatAsciiStlNumber(p0[1])} ${formatAsciiStlNumber(p0[2])}`,
				`      vertex ${formatAsciiStlNumber(p1[0])} ${formatAsciiStlNumber(p1[1])} ${formatAsciiStlNumber(p1[2])}`,
				`      vertex ${formatAsciiStlNumber(p2[0])} ${formatAsciiStlNumber(p2[1])} ${formatAsciiStlNumber(p2[2])}`,
				"    endloop",
				"  endfacet",
			);
		}
		lines.push(`endsolid ${name}`);
	}

	return new TextEncoder().encode(lines.join("\n"));
}

export function buildPreviewMesh(manifold) {
	return buildPreviewMeshFromModels([manifold]);
}

function combineBounds(manifolds) {
	const bounds = {
		min: [Infinity, Infinity, Infinity],
		max: [-Infinity, -Infinity, -Infinity],
	};
	for (const manifold of manifolds) {
		const box = manifold.boundingBox();
		for (let axis = 0; axis < 3; axis++) {
			bounds.min[axis] = Math.min(bounds.min[axis], box.min[axis]);
			bounds.max[axis] = Math.max(bounds.max[axis], box.max[axis]);
		}
	}
	if (!manifolds.length) {
		return { min: [0, 0, 0], max: [0, 0, 0] };
	}
	return bounds;
}

export function buildPreviewMeshFromModels(manifolds) {
	if (manifolds.length === 1) {
		const manifold = manifolds[0];
		const mesh = manifold.getMesh();
		const vertexCount = mesh.vertProperties.length / mesh.numProp;
		const positions = new Float32Array(vertexCount * 3);

		for (let index = 0; index < vertexCount; index++) {
			const base = index * mesh.numProp;
			const target = index * 3;
			positions[target] = mesh.vertProperties[base];
			positions[target + 1] = mesh.vertProperties[base + 1];
			positions[target + 2] = mesh.vertProperties[base + 2];
		}

		return {
			positions,
			indices: new Uint32Array(mesh.triVerts),
			bounds: manifold.boundingBox(),
		};
	}

	const meshes = manifolds.map((manifold) => manifold.getMesh());
	const vertexCount = meshes.reduce(
		(total, mesh) => total + mesh.vertProperties.length / mesh.numProp,
		0,
	);
	const indexCount = meshes.reduce(
		(total, mesh) => total + mesh.triVerts.length,
		0,
	);
	const positions = new Float32Array(vertexCount * 3);
	const indices = new Uint32Array(indexCount);
	let vertexOffset = 0;
	let positionOffset = 0;
	let indexOffset = 0;

	for (const mesh of meshes) {
		const meshVertexCount = mesh.vertProperties.length / mesh.numProp;
		for (let index = 0; index < meshVertexCount; index++) {
			const base = index * mesh.numProp;
			positions[positionOffset++] = mesh.vertProperties[base];
			positions[positionOffset++] = mesh.vertProperties[base + 1];
			positions[positionOffset++] = mesh.vertProperties[base + 2];
		}
		for (let index = 0; index < mesh.triVerts.length; index++) {
			indices[indexOffset++] = mesh.triVerts[index] + vertexOffset;
		}
		vertexOffset += meshVertexCount;
	}

	return {
		positions,
		indices,
		bounds: combineBounds(manifolds),
	};
}
