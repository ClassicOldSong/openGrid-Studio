import { isSignal, nextTick, watch } from "refui";

function readValue(value) {
	return isSignal(value) ? value.value : value;
}

export default function BoundSelect({ value, children, ...props }) {
	const bindSelect = (node) => {
		watch(() => {
			const nextValue = readValue(value);
			nextTick(() => {
				if (nextValue === undefined || nextValue === null) return;
				const normalizedValue = String(nextValue);
				if (node.value !== normalizedValue) node.value = normalizedValue;
			});
		});
	};

	return (
		<select {...props} $ref={bindSelect}>
			{children}
		</select>
	);
}
