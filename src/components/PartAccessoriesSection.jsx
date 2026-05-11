import { If } from "refui";
import {
	HELP_LINK_CLASS,
	SECTION_CLASS,
	SECTION_TITLE_CLASS,
} from "../ui-styles.js";

function normalizeAccessories(accessories) {
	if (!Array.isArray(accessories)) return [];
	return accessories.filter((accessory) => accessory?.name && accessory?.url);
}

export default function PartAccessoriesSection({ accessories = [] }) {
	const items = normalizeAccessories(accessories);

	return (
		<If condition={items.length > 0}>
			{() => (
				<div class={SECTION_CLASS}>
					<div class={SECTION_TITLE_CLASS}>Accessories</div>
					<ul class="grid gap-2">
						{items.map((accessory) => (
							<li class="text-xs leading-5 text-gray-500 dark:text-slate-400">
								<a
									class={HELP_LINK_CLASS}
									href={accessory.url}
									target="_blank"
									rel="noreferrer"
								>
									{accessory.name}
								</a>
								{accessory.source ? ` - ${accessory.source}` : ""}
							</li>
						))}
					</ul>
				</div>
			)}
		</If>
	);
}
