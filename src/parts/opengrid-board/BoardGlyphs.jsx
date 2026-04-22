import { $, If } from 'refui'

const inner = 6
const hole = 5

function diamondPoints(x, y, r) {
	return `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`
}

export const NodeGlyph = ({ kind, state, x, y, dir, innerFill = '#fff' }) => {
	const visible = $(() => ['outer', 'edge', 'inner', 'full', 'diag'].includes(kind.value))
	const showChamfer = $(() => visible.value && state.value === 'chamfer')
	const showHole = $(() => visible.value && state.value === 'hole')

	return (
		<>
			<If condition={showChamfer}>
				{() => <polygon attr:points={diamondPoints(x, y, inner)} attr:fill={innerFill} />}
			</If>
			<If condition={showHole}>
				{() => <circle attr:cx={x} attr:cy={y} attr:r={hole} attr:fill={innerFill} />}
			</If>
		</>
	)
}
