const CONNECTOR_CUTOUT_RADIUS = 2.6;
const CONNECTOR_CUTOUT_SEPARATION = 2.5;
export const CONNECTOR_CUTOUT_HEIGHT = 2.4;
const CONNECTOR_STEM_ROUNDING = 0.25;
const CONNECTOR_SHOULDER_FILLET_RADIUS = 0.5;
const CONNECTOR_INNER_BLEND_RADIUS = Math.sqrt(125 / 16);
export const LITE_CONNECTOR_CUTOUT_DISTANCE_FROM_TOP = 1;

const connectorCutCache = new Map();

function circleIntersections(centerA, radiusA, centerB, radiusB) {
	const dx = centerB[0] - centerA[0];
	const dy = centerB[1] - centerA[1];
	const distance = Math.hypot(dx, dy);
	const along =
		(radiusA ** 2 - radiusB ** 2 + distance ** 2) / (2 * distance);
	const height = Math.sqrt(Math.max(0, radiusA ** 2 - along ** 2));
	const midX = centerA[0] + (along * dx) / distance;
	const midY = centerA[1] + (along * dy) / distance;
	return [
		[midX + (-dy * height) / distance, midY + (dx * height) / distance],
		[midX - (-dy * height) / distance, midY - (dx * height) / distance],
	];
}

function angleOfPoint(center, point) {
	return Math.atan2(point[1] - center[1], point[0] - center[0]);
}

function sampleArc(center, radius, startAngle, endAngle, steps) {
	const points = [];
	for (let i = 1; i <= steps; i++) {
		const t = i / steps;
		const angle = startAngle + (endAngle - startAngle) * t;
		points.push([
			center[0] + radius * Math.cos(angle),
			center[1] + radius * Math.sin(angle),
		]);
	}
	return points;
}

export function buildConnectorCut(Manifold, CrossSection, circleSegments) {
	if (!connectorCutCache.has(circleSegments)) {
		const outerCenter = [CONNECTOR_CUTOUT_SEPARATION, 0];
		const innerBlendCenterUpper = [
			0,
			CONNECTOR_CUTOUT_RADIUS + CONNECTOR_CUTOUT_SEPARATION,
		];
		const innerBlendCenterLower = [
			0,
			-(CONNECTOR_CUTOUT_RADIUS + CONNECTOR_CUTOUT_SEPARATION),
		];
		const shoulderInset = Math.sqrt(
			(CONNECTOR_INNER_BLEND_RADIUS + CONNECTOR_SHOULDER_FILLET_RADIUS) ** 2 -
				(
					CONNECTOR_CUTOUT_SEPARATION + CONNECTOR_SHOULDER_FILLET_RADIUS
				) ** 2,
		);
		const shoulderCenterUpper = [
			shoulderInset,
			CONNECTOR_CUTOUT_RADIUS - CONNECTOR_SHOULDER_FILLET_RADIUS,
		];
		const shoulderCenterLower = [
			shoulderInset,
			-(CONNECTOR_CUTOUT_RADIUS - CONNECTOR_SHOULDER_FILLET_RADIUS),
		];
		const sideHalfWidth =
			CONNECTOR_CUTOUT_RADIUS + CONNECTOR_CUTOUT_SEPARATION -
			Math.sqrt(
				(CONNECTOR_INNER_BLEND_RADIUS - CONNECTOR_STEM_ROUNDING) ** 2 -
					CONNECTOR_STEM_ROUNDING ** 2,
			);
		const sideNoseCenterUpper = [CONNECTOR_STEM_ROUNDING, sideHalfWidth];
		const sideNoseCenterLower = [CONNECTOR_STEM_ROUNDING, -sideHalfWidth];

		const upperNoseJoin = circleIntersections(
			sideNoseCenterUpper,
			CONNECTOR_STEM_ROUNDING,
			innerBlendCenterUpper,
			CONNECTOR_INNER_BLEND_RADIUS,
		).sort((a, b) => b[1] - a[1])[0];
		const upperShoulderJoin = circleIntersections(
			innerBlendCenterUpper,
			CONNECTOR_INNER_BLEND_RADIUS,
			shoulderCenterUpper,
			CONNECTOR_SHOULDER_FILLET_RADIUS,
		).sort((a, b) => b[1] - a[1])[0];
		const lowerShoulderJoin = [upperShoulderJoin[0], -upperShoulderJoin[1]];
		const lowerNoseJoin = [upperNoseJoin[0], -upperNoseJoin[1]];

		const noseSteps = Math.max(6, Math.ceil(circleSegments / 8));
		const blendSteps = Math.max(10, Math.ceil(circleSegments / 6));
		const outerSteps = Math.max(16, Math.ceil(circleSegments / 2));

		const upperNoseEndAngle = angleOfPoint(sideNoseCenterUpper, upperNoseJoin);
		const points = [
			[0, sideHalfWidth],
			...sampleArc(
				sideNoseCenterUpper,
				CONNECTOR_STEM_ROUNDING,
				Math.PI,
				upperNoseEndAngle < 0
					? upperNoseEndAngle + Math.PI * 2
					: upperNoseEndAngle,
				noseSteps,
			),
			...sampleArc(
				innerBlendCenterUpper,
				CONNECTOR_INNER_BLEND_RADIUS,
				angleOfPoint(innerBlendCenterUpper, upperNoseJoin),
				angleOfPoint(innerBlendCenterUpper, upperShoulderJoin),
				blendSteps,
			),
			...sampleArc(
				shoulderCenterUpper,
				CONNECTOR_SHOULDER_FILLET_RADIUS,
				angleOfPoint(shoulderCenterUpper, upperShoulderJoin),
				Math.PI / 2,
				noseSteps,
			),
			[CONNECTOR_CUTOUT_SEPARATION, CONNECTOR_CUTOUT_RADIUS],
			...sampleArc(
				outerCenter,
				CONNECTOR_CUTOUT_RADIUS,
				Math.PI / 2,
				-Math.PI / 2,
				outerSteps,
			),
			[shoulderInset, -CONNECTOR_CUTOUT_RADIUS],
			...sampleArc(
				shoulderCenterLower,
				CONNECTOR_SHOULDER_FILLET_RADIUS,
				-Math.PI / 2,
				angleOfPoint(shoulderCenterLower, lowerShoulderJoin),
				noseSteps,
			),
			...sampleArc(
				innerBlendCenterLower,
				CONNECTOR_INNER_BLEND_RADIUS,
				angleOfPoint(innerBlendCenterLower, lowerShoulderJoin),
				angleOfPoint(innerBlendCenterLower, lowerNoseJoin),
				blendSteps,
			),
			...sampleArc(
				sideNoseCenterLower,
				CONNECTOR_STEM_ROUNDING,
				angleOfPoint(sideNoseCenterLower, lowerNoseJoin),
				Math.PI,
				noseSteps,
			),
		];
		const profile = new CrossSection([[...points].reverse()]);
		connectorCutCache.set(
			circleSegments,
			profile.extrude(CONNECTOR_CUTOUT_HEIGHT, 0, 0, [1, 1], true),
		);
	}

	return connectorCutCache.get(circleSegments);
}

export function getConnectorCutZ(boardType, baseThickness) {
	return boardType === "Lite"
		? baseThickness -
				CONNECTOR_CUTOUT_HEIGHT / 2 -
				LITE_CONNECTOR_CUTOUT_DISTANCE_FROM_TOP
		: baseThickness / 2;
}
