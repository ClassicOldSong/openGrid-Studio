export const GLOBAL_CONFIG_STORAGE_KEY = "opengrid-studio-global-config-v1";
export const PART_CONFIG_STORAGE_PREFIX = "opengrid-studio-part-config-v1:";
export const LEGACY_CONFIG_STORAGE_KEYS = [
	"opengrid-studio-config-v3",
	"opengrid-mask-editor-config-v2",
];

function readJSON(storage, key) {
	try {
		const raw = storage.getItem(key);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

function writeJSON(storage, key, value) {
	storage.setItem(key, JSON.stringify(value));
}

function cloneConfig(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return JSON.parse(JSON.stringify(value));
}

function getPartConfigStorageKey(partId, prefix) {
	return `${prefix}${partId}`;
}

function readLegacyConfig(storage, legacyKeys) {
	for (const key of legacyKeys) {
		const config = readJSON(storage, key);
		if (config && typeof config === "object") return config;
	}
	return null;
}

function getLegacyPartConfig(legacyConfig, partId) {
	if (!legacyConfig || typeof legacyConfig !== "object") return {};
	const storedPartConfig = legacyConfig.partConfigs?.[partId];
	if (storedPartConfig && typeof storedPartConfig === "object") {
		return cloneConfig(storedPartConfig);
	}
	if (legacyConfig.partConfigs || legacyConfig.partId !== partId) return {};
	const {
		partId: _partId,
		themeMode: _themeMode,
		theme: _theme,
		exportFormat: _exportFormat,
		partConfigs: _partConfigs,
		...partConfig
	} = legacyConfig;
	return cloneConfig(partConfig);
}

export function createConfigManager({
	storage = localStorage,
	defaultPartId,
	resolvePartId = (partId) => partId ?? defaultPartId,
	defaultGlobalConfig = {},
	globalKey = GLOBAL_CONFIG_STORAGE_KEY,
	partKeyPrefix = PART_CONFIG_STORAGE_PREFIX,
	legacyKeys = LEGACY_CONFIG_STORAGE_KEYS,
} = {}) {
	let legacyConfigCache;
	const getLegacyConfig = () => {
		if (legacyConfigCache === undefined) {
			legacyConfigCache = readLegacyConfig(storage, legacyKeys);
		}
		return legacyConfigCache;
	};

	const createDefaultGlobalConfig = (partId = defaultPartId) => ({
		themeMode: "auto",
		exportFormat: "stl-binary",
		...defaultGlobalConfig,
		partId: resolvePartId(partId),
	});

	const normalizeGlobalConfig = (config = {}) => {
		const defaults = createDefaultGlobalConfig(config.partId ?? defaultPartId);
		return {
			...defaults,
			partId: resolvePartId(config.partId ?? defaults.partId),
			themeMode:
				config.themeMode ??
				(config.theme === "light" || config.theme === "dark"
					? config.theme
					: defaults.themeMode),
			exportFormat: config.exportFormat ?? defaults.exportFormat,
		};
	};

	const globalStorage = Object.freeze({
		load() {
			return normalizeGlobalConfig(readJSON(storage, globalKey) ?? getLegacyConfig() ?? {});
		},
		save(config) {
			writeJSON(storage, globalKey, normalizeGlobalConfig(config));
		},
		clear() {
			storage.removeItem(globalKey);
		},
	});

	const partStorage = Object.freeze({
		load(partId) {
			const resolvedPartId = resolvePartId(partId);
			const stored = readJSON(
				storage,
				getPartConfigStorageKey(resolvedPartId, partKeyPrefix),
			);
			if (stored && typeof stored === "object") return cloneConfig(stored);
			return getLegacyPartConfig(getLegacyConfig(), resolvedPartId);
		},
		save(partId, config) {
			const resolvedPartId = resolvePartId(partId);
			writeJSON(
				storage,
				getPartConfigStorageKey(resolvedPartId, partKeyPrefix),
				cloneConfig(config),
			);
		},
		clear(partId) {
			storage.removeItem(
				getPartConfigStorageKey(resolvePartId(partId), partKeyPrefix),
			);
		},
		clearAll() {
			const keys = [];
			for (let index = 0; index < storage.length; index++) {
				const key = storage.key(index);
				if (key?.startsWith(partKeyPrefix)) keys.push(key);
			}
			for (const key of keys) storage.removeItem(key);
		},
	});

	const clearLegacy = () => {
		for (const key of legacyKeys) storage.removeItem(key);
		legacyConfigCache = null;
	};

	return Object.freeze({
		globalStorage,
		partStorage,
		createDefaultGlobalConfig,
		normalizeGlobalConfig,
		loadGlobalConfig: globalStorage.load,
		saveGlobalConfig: globalStorage.save,
		loadPartConfig: partStorage.load,
		savePartConfig: partStorage.save,
		clearAll() {
			globalStorage.clear();
			partStorage.clearAll();
			clearLegacy();
		},
	});
}
