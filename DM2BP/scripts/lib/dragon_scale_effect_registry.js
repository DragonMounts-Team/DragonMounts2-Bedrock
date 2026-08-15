const dragonScaleEffectRegistry = new Map();
const dragonScaleLoreRegistry = new Map();

export function registerDragonScaleEffect(componentId, config = {}) {
	if (!componentId) {
		throw new Error("Dragon scale effect registration requires a component id.");
	}

	const normalized = {
		effectsKey: config.effectsKey ?? componentId,
		setKey: config.setKey ?? `${componentId.replace(/:$/, "")}_set`,
		maxCd: config.maxCd ?? null,
		getCd: config.getCd ?? (() => 0),
		tiers: config.tiers ?? null,
		label: config.label ?? componentId,
		handler: config.handler ?? null,
		...config
	};

	dragonScaleEffectRegistry.set(String(componentId), normalized);
	return normalized;
}

export function registerDragonScaleLore(componentId, config = {}) {
	if (!componentId) {
		throw new Error("Dragon scale lore registration requires a component id.");
	}

	const normalized = {
		effectsKey: config.effectsKey ?? componentId,
		setKey: config.setKey ?? `${componentId.replace(/:$/, "")}_set`,
		maxCd: config.maxCd ?? null,
		getCd: config.getCd ?? (() => 0),
		tiers: config.tiers ?? null,
		label: config.label ?? componentId,
		description: config.description ?? null,
		...config
	};

	dragonScaleLoreRegistry.set(String(componentId), normalized);
	return normalized;
}

export function unregisterDragonScaleEffect(componentId) {
	dragonScaleEffectRegistry.delete(String(componentId));
	return true;
}

export function unregisterDragonScaleLore(componentId) {
	dragonScaleLoreRegistry.delete(String(componentId));
	return true;
}

export function getDragonScaleEffect(componentId) {
	return dragonScaleEffectRegistry.get(String(componentId)) ?? null;
}

export function getDragonScaleLore(componentId) {
	return dragonScaleLoreRegistry.get(String(componentId)) ?? null;
}

export function getAllDragonScaleEffects() {
	return Object.fromEntries(dragonScaleEffectRegistry.entries());
}

export function getAllDragonScaleLore() {
	return Object.fromEntries(dragonScaleLoreRegistry.entries());
}

export const dragonScaleEffects = dragonScaleEffectRegistry;
export const dragonScaleLore = dragonScaleLoreRegistry;

export default {
	registerDragonScaleEffect,
	registerDragonScaleLore,
	unregisterDragonScaleEffect,
	unregisterDragonScaleLore,
	getDragonScaleEffect,
	getDragonScaleLore,
	getAllDragonScaleEffects,
	getAllDragonScaleLore,
	dragonScaleEffects,
	dragonScaleLore
};
