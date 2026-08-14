// Player Modules: dragon_scale armor effects and XP helpers (trimmed comments)

import { world, system, EquipmentSlot, EntityDamageCause, EntityEquippableComponent, EntityHealthComponent, EntityHungerComponent, EntityTameableComponent, Player } from "@minecraft/server";

// Configuration constants
const CONFIG = {
	XP_BOOST_MULTIPLIER: 1.5, // 50% more XP guaranteed (1.0 = normal, 1.5 = 50% more)
	XP_ORBS_PER_SPLIT: 64, // Max XP per orb (Minecraft standard)
	CLEANUP_INTERVAL: 1200,
	// Base XP tiers for dynamic calculation (health-based)
	XP_TIER_HOSTILE_WEAK: 2,      // Slimes, silverfish, etc.
	XP_TIER_HOSTILE_NORMAL: 5,    // Zombies, skeletons, creepers
	XP_TIER_HOSTILE_STRONG: 10,   // Blazes, ghasts, guardians
	XP_TIER_BOSS: 50,             // Wardens, elder guardians
	XP_TIER_BOSS_MAJOR: 120,      // Ender dragons
};

const ARMOR_SLOTS = [
	EquipmentSlot.Head,
	EquipmentSlot.Chest,
	EquipmentSlot.Legs,
	EquipmentSlot.Feet,
];

/**
 * Entity type classifications for dynamic XP calculation
 * Uses health values and special types to determine XP rewards
 * XP is calculated as: baseXP * CONFIG.XP_BOOST_MULTIPLIER
 */
const HOSTILE_ENTITIES = new Set([
	"minecraft:zombie", "minecraft:zombified_piglin", "minecraft:skeleton",
	"minecraft:wither_skeleton", "minecraft:creeper", "minecraft:spider",
	"minecraft:cave_spider", "minecraft:enderman", "minecraft:silverfish",
	"minecraft:witch", "minecraft:slime", "minecraft:magma_cube",
	"minecraft:blaze", "minecraft:ghast", "minecraft:piglin_brute",
	"minecraft:hoglin", "minecraft:piglin", "minecraft:endermite",
	"minecraft:shulker", "minecraft:drowned", "minecraft:guardian"
]);

const BOSS_ENTITIES = new Set([
	"minecraft:ender_dragon", "minecraft:warden", "minecraft:elder_guardian"
]);
const DRAGON_ARMOR_LORE = {
	"dragonmounts2:fire_dragon_scale_lore": {
		effectsKey: "dragonmounts2:fire_dragon_scale_effects",
		setKey: "dragonmounts2:fire_dragon_scale_set",
		maxCd: 45.0,
		getCd: (player, _now) => player.getItemCooldown("dragonmounts2:fire_dragon_scale") / 20,
	},
	"dragonmounts2:enchanted_dragon_scale_lore": {
		effectsKey: "dragonmounts2:enchanted_dragon_scale_effects",
		setKey: "dragonmounts2:enchanted_dragon_scale_set",
		maxCd: null,
		getCd: () => 0,
	},
	"dragonmounts2:dark_dragon_scale_lore": {
		effectsKey: "dragonmounts2:dark_dragon_scale_effects",
		setKey: "dragonmounts2:dark_dragon_scale_set",
		maxCd: 30.0,
		getCd: (player, now) => {
			const expiry = cooldowns.get(player.id)?.get("dark_dragon_scale_night_heal");
			return expiry ? Math.max(0, (expiry - now) / 20) : 0;
		},
	},
	"dragonmounts2:light_dragon_scale_lore": {
		effectsKey: "dragonmounts2:light_dragon_scale_effects",
		setKey: "dragonmounts2:light_dragon_scale_set",
		maxCd: 30.0,
		getCd: (player, now) => {
			const expiry = cooldowns.get(player.id)?.get("light_dragon_scale_day_heal");
			return expiry ? Math.max(0, (expiry - now) / 20) : 0;
		},
	},
	"dragonmounts2:aether_dragon_scale_lore": {
		effectsKey: "dragonmounts2:aether_dragon_scale_effects",
		setKey: "dragonmounts2:aether_dragon_scale_set",
		maxCd: 15.0,
		getCd: (player, now) => {
			const expiry = cooldowns.get(player.id)?.get("aether_dragon_scale_sprint_speed");
			return expiry ? Math.max(0, (expiry - now) / 20) : 0;
		},
	},
	"dragonmounts2:ice_dragon_scale_lore": {
		effectsKey: "dragonmounts2:ice_dragon_scale_effects",
		setKey: "dragonmounts2:ice_dragon_scale_set",
		maxCd: 60.0,
		getCd: (player, now) => {
			const expiry = cooldowns.get(player.id)?.get("ice_dragon_scale_defensive_burst");
			return expiry ? Math.max(0, (expiry - now) / 20) : 0;
		},
	},
	"dragonmounts2:forest_dragon_scale_lore": {
		effectsKey: "dragonmounts2:forest_dragon_scale_effects",
		setKey: "dragonmounts2:forest_dragon_scale_set",
		maxCd: 60.0,
		getCd: (player, now) => {
			const expiry = cooldowns.get(player.id)?.get("forest_dragon_scale_low_health_regen");
			return expiry ? Math.max(0, (expiry - now) / 20) : 0;
		},
	},
	"dragonmounts2:ender_dragon_scale_lore": {
		effectsKey: "dragonmounts2:ender_dragon_scale_effects",
		setKey: "dragonmounts2:ender_dragon_scale_set",
		maxCd: 60.0,
		getCd: (player, now) => {
			const expiry = cooldowns.get(player.id)?.get("ender_dragon_scale_low_health_buff");
			return expiry ? Math.max(0, (expiry - now) / 20) : 0;
		},
	},
	"dragonmounts2:water_dragon_scale_lore": {
		effectsKey: "dragonmounts2:water_dragon_scale_effects",
		setKey: "dragonmounts2:water_dragon_scale_set",
		maxCd: null,
		getCd: () => 0,
	},
	"dragonmounts2:moonlight_dragon_scale_lore": {
		effectsKey: "dragonmounts2:moonlight_dragon_scale_effects",
		setKey: "dragonmounts2:moonlight_dragon_scale_set",
		maxCd: null,
		getCd: () => 0,
	},
	"dragonmounts2:storm_dragon_scale_lore": {
		effectsKey: "dragonmounts2:storm_dragon_scale_effects",
		setKey: "dragonmounts2:storm_dragon_scale_set",
		maxCd: null,
		getCd: () => 0,
	},
	"dragonmounts2:sculk_dragon_scale_lore": {
		effectsKey: "dragonmounts2:sculk_dragon_scale_effects",
		setKey: "dragonmounts2:sculk_dragon_scale_set",
		maxCd: null,
		getCd: () => 0,
		tiers: [
			{ threshold: 2, suffix: ".2" },
			{ threshold: 4, suffix: "" },
		],
	},
	"dragonmounts2:terra_dragon_scale_lore": {
		effectsKey: "dragonmounts2:terra_dragon_scale_effects",
		setKey: "dragonmounts2:terra_dragon_scale_set",
		maxCd: null,
		getCd: () => 0,
	},
	"dragonmounts2:wither_dragon_scale_lore": {
		effectsKey: "dragonmounts2:wither_dragon_scale_effects",
		setKey: "dragonmounts2:wither_dragon_scale_set",
		maxCd: null,
		getCd: () => 0,
	},
	"dragonmounts2:zombie_dragon_scale_lore": {
		effectsKey: "dragonmounts2:zombie_dragon_scale_effects",
		setKey: "dragonmounts2:zombie_dragon_scale_set",
		maxCd: null,
		getCd: () => 0,
	},
	"dragonmounts2:sunlight_dragon_scale_lore": {
		effectsKey: "dragonmounts2:sunlight_dragon_scale_effects",
		setKey: "dragonmounts2:sunlight_dragon_scale_set",
		maxCd: null,
		getCd: () => 0,
	},
	"dragonmounts2:nether_dragon_scale_lore": {
		effectsKey: "dragonmounts2:nether_dragon_scale_effects",
		setKey: "dragonmounts2:nether_dragon_scale_set",
		maxCd: null,
		getCd: () => 0,
	},
};
const DRAGON_ARMOR_LORE_ENTRIES = Object.entries(DRAGON_ARMOR_LORE);
const cooldowns = new Map();
const pendingReflect = new Map();
const stormLightningCooldowns = new Map();
const CLEANUP_INTERVAL = 1200;
let lastCleanup = 0;
const playersWithDragonArmor = new Set();  // OPTIMIZATION: Cache players with dragon armor

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
	cooldowns.delete(playerId);
	pendingReflect.delete(playerId);
	playersWithDragonArmor.delete(playerId);  // Clean up cache
});

function refreshDragonArmorCacheForPlayer(player) {
	if (!player || !player.isValid) return false;

	const equip = player.getComponent(EntityEquippableComponent.componentId);
	const hasArmor = Boolean(equip && hasAnyDragonArmor(equip));

	if (hasArmor) {
		playersWithDragonArmor.add(player.id);
	} else {
		playersWithDragonArmor.delete(player.id);
	}

	return hasArmor;
}

// OPTIMIZATION: Update armor cache on join/equip changes (event-driven, not every tick)
world.afterEvents.playerSpawn.subscribe(({ player }) => {
	refreshDragonArmorCacheForPlayer(player);
});

world.afterEvents.itemCompleteUse.subscribe(({ source }) => {
	if (!(source instanceof Player)) return;
	const hasArmor = refreshDragonArmorCacheForPlayer(source);
	if (hasArmor) {
		system.run(() => updateDragonArmorLore(source));
	}
});

function cleanupExpiredCooldowns(now) {
	if (now - lastCleanup < CLEANUP_INTERVAL) return;
	lastCleanup = now;

	for (const [playerId, playerCooldowns] of cooldowns) {
		for (const [key, expiry] of playerCooldowns) {
			if (expiry <= now) playerCooldowns.delete(key);
		}
		if (playerCooldowns.size === 0) cooldowns.delete(playerId);
	}
}

function isCooldownActive(playerId, key, now) {
	const expiry = cooldowns.get(playerId)?.get(key);
	return expiry !== undefined && expiry > now;
}

function setCooldown(playerId, key, seconds, now) {
	let map = cooldowns.get(playerId);
	if (!map) {
		map = new Map();
		cooldowns.set(playerId, map);
	}
	map.set(key, now + seconds * 20);
}
function isWearingFullSet(equip, componentType) {
	for (const slot of ARMOR_SLOTS) {
		if (!equip.getEquipmentSlot(slot).getItem()?.getComponent(componentType)) return false;
	}
	return true;
}

function hasAnyDragonArmor(equip) {
	// OPTIMIZATION: Quick check if player has ANY dragon armor
	for (const slot of ARMOR_SLOTS) {
		const item = equip.getEquipmentSlot(slot).getItem();
		if (!item) continue;
		// Check if item has any dragon_scale component
		for (const [, data] of DRAGON_ARMOR_LORE_ENTRIES) {
			if (item.getComponent(data.effectsKey)) return true;
		}
	}
	return false;
}

function countArmorPieces(equip, componentType) {
	let count = 0;
	for (const slot of ARMOR_SLOTS) {
		if (equip.getEquipmentSlot(slot).getItem()?.getComponent(componentType)) count++;
	}
	return count;
}
function applyDragonLoreToItem(item, fullSetMap, pieceCountMap, player, now) {
	for (const [componentId, data] of DRAGON_ARMOR_LORE_ENTRIES) {
		if (!item.getComponent(componentId)) continue;

		const lore = [];

		if (data.tiers) {
			const pieceCount = pieceCountMap.get(componentId) ?? 0;
			for (const tier of data.tiers) {
				const color = pieceCount >= tier.threshold ? "§a" : "§7";
				lore.push({ rawtext: [{ text: color, italic: false }, { translate: `tooltip.${data.setKey}.lore.set${tier.suffix}`, italic: false }] });
				lore.push({ rawtext: [{ text: "§f", italic: false }, { translate: `tooltip.${data.setKey}.lore.disc${tier.suffix}`, italic: false }] });
			}
		} else {
			const color = (fullSetMap.get(componentId) ?? false) ? "§a" : "§7";
			lore.push({ rawtext: [{ text: color, italic: false }, { translate: `tooltip.${data.setKey}.lore.set`, italic: false }] });
			lore.push({ rawtext: [{ text: "§f", italic: false }, { translate: `tooltip.${data.setKey}.lore.disc`, italic: false }] });
		}

		if (data.maxCd !== null) {
			lore.push({ rawtext: [
				{ text: "§f", italic: false },
				{ translate: "tooltip.dragonmounts2.cooldown", italic: false },
				{ text: ` ${data.maxCd.toFixed(1)}`, italic: false },
				{ translate: "tooltip.dragonmounts2.seconds", italic: false },
			] });
		}

		item.setLore(lore);
		return item;
	}
	return null;
}

function updateDragonArmorLore(player) {
	const equip = player.getComponent(EntityEquippableComponent.componentId);
	if (!equip) return;

	const now = system.currentTick;
	const fullSetMap = new Map();
	const pieceCountMap = new Map();

	for (const [componentId, data] of DRAGON_ARMOR_LORE_ENTRIES) {
		fullSetMap.set(componentId, isWearingFullSet(equip, data.effectsKey));
		if (data.tiers) pieceCountMap.set(componentId, countArmorPieces(equip, data.effectsKey));
	}

	for (const slot of ARMOR_SLOTS) {
		const item = equip.getEquipmentSlot(slot).getItem();
		if (!item) continue;
		const modified = applyDragonLoreToItem(item, fullSetMap, pieceCountMap, player, now);
		if (modified) equip.getEquipmentSlot(slot).setItem(modified);
	}

	const mainhand = equip.getEquipmentSlot(EquipmentSlot.Mainhand).getItem();
	if (mainhand) {
		const modified = applyDragonLoreToItem(mainhand, fullSetMap, pieceCountMap, player, now);
		if (modified) equip.getEquipmentSlot(EquipmentSlot.Mainhand).setItem(modified);
	}

	const container = player.getComponent("minecraft:inventory")?.container; // 2.8.0 pattern: stable component ID
	if (!container) return;

	for (let i = 0; i < container.size; i++) {
		const item = container.getItem(i);
		if (!item) continue;
		const modified = applyDragonLoreToItem(item, fullSetMap, pieceCountMap, player, now);
		if (modified) container.setItem(i, modified);
	}
}
function applyAoeKnockback(hurtEntity, playerId, radius, knockbackStrength, applyEffect) {
	const origin = hurtEntity.location;
	const nearbyEntities = hurtEntity.dimension.getEntities({
		location: origin,
		maxDistance: radius,
	});

	for (const entity of nearbyEntities) {
		if (!entity.isValid || entity.id === hurtEntity.id) continue;

		const tameable = entity.getComponent(EntityTameableComponent.componentId);
		if (tameable?.isTamed && tameable.tamedToPlayerId === playerId) continue;

		try {
			const dx = entity.location.x - origin.x;
			const dz = entity.location.z - origin.z;
			const distance = Math.sqrt(dx * dx + dz * dz);

			if (distance > 0) {
				const velocity = entity.getVelocity();
				entity.applyImpulse({
					x: velocity.x + (dx / distance) * knockbackStrength,
					y: velocity.y + 0.4,
					z: velocity.z + (dz / distance) * knockbackStrength,
				});
			}

			applyEffect(entity);
		} catch (error) {
			console.warn(`AoE effect failed on entity: ${error}`);
		}
	}
}
function isNight(timeOfDay) {
	return timeOfDay >= 12000 && timeOfDay < 24000;
}

function isDay(timeOfDay) {
	return timeOfDay >= 0 && timeOfDay < 12000;
}

/**
 * Spawns XP orbs at the entity's death location with guaranteed 50% boost applied
 * Splits XP into multiple orbs (max 64 per orb) with natural velocity spread
 * Optimized: Pre-calculates orb count and velocities for fewer iterations
 * @param {Dimension} dimension - The dimension where the XP should spawn
 * @param {Vector3} location - The location where the entity died
 * @param {number} totalXp - Total XP amount to spawn (boost already applied)
 */
function spawnXpOrbs(dimension, location, totalXp) {
	if (!dimension || !location || totalXp <= 0) return;

	try {
		const maxXpPerOrb = CONFIG.XP_ORBS_PER_SPLIT;
		const orbCount = Math.ceil(totalXp / maxXpPerOrb);

		// Pre-calculate all orb data to minimize iterations
		const orbs = [];
		let remaining = totalXp;

		for (let i = 0; i < orbCount; i++) {
			const xpAmount = Math.min(remaining, maxXpPerOrb);
			const angle = Math.random() * Math.PI * 2;
			const speed = 0.3 + Math.random() * 0.2;

			orbs.push({
				xp: xpAmount,
				velocity: {
					x: Math.cos(angle) * speed,
					y: 0.2,
					z: Math.sin(angle) * speed
				}
			});
			remaining -= xpAmount;
		}

		// Spawn all orbs in a single loop
		for (const orbData of orbs) {
			const orb = dimension.spawnEntity("xp_orb", {
				x: location.x,
				y: location.y,
				z: location.z
			});

			if (orb) {
				orb.setProperty("xp_value", orbData.xp);
				orb.applyImpulse(orbData.velocity);
			}
		}
	} catch (error) {
		console.warn(`Failed to spawn XP orbs: ${error}`);
	}
}

/**
 * Apply a timed effect if cooldown is not active - Optimized
 * Consistent helper for all cooldown-based armor effects
 * Avoids redundant equip check by accepting component parameter
 * @param {Player} player - The player to affect
 * @param {EntityEquippableComponent} equip - Pre-fetched equippable component
 * @param {string} playerId - The player's ID
 * @param {string} componentType - The armor component type to check
 * @param {string} cooldownKey - The cooldown key
 * @param {string} effectName - The effect to apply
 * @param {number} duration - Duration in ticks
 * @param {number} amplifier - Effect amplifier
 * @param {number} now - Current tick
 * @param {number} cooldownSeconds - Cooldown duration in seconds
 */
function applyTimedArmorEffect(player, equip, playerId, componentType, cooldownKey, effectName, duration, amplifier, now, cooldownSeconds) {
	if (!isWearingFullSet(equip, componentType)) return false;
	if (isCooldownActive(playerId, cooldownKey, now)) return false;

	player.addEffect(effectName, duration, { amplifier, showParticles: true });
	setCooldown(playerId, cooldownKey, cooldownSeconds, now);
	system.run(() => updateDragonArmorLore(player));
	return true;
}

/**
 * Apply a passive armor effect that runs every interval
 * Consistent helper for continuous armor effects
 * @param {Player} player - The player to affect
 * @param {EntityEquippableComponent} equip - The player's equippable component
 * @param {string} componentType - The armor component type to check
 * @param {string} effectName - The effect to apply
 * @param {number} duration - Duration in ticks
 * @param {number} amplifier - Effect amplifier
 */
function applyPassiveArmorEffect(player, equip, componentType, effectName, duration, amplifier = 0) {
	if (!equip || !isWearingFullSet(equip, componentType)) return;
	player.addEffect(effectName, duration, { amplifier, showParticles: true });
}

/**
 * Main armor effect processor - applies all dragon_scale effects consistently
 * Optimized: Pre-fetches all components once, reduces redundant checks
 * @param {Player} player - The player to process
 * @param {number} now - Current game tick
 * @param {number} timeOfDay - Current time of day (0-24000)
 */
function processPlayerArmorEffects(player, now, timeOfDay) {
	// Fetch all components once for efficiency
	const equip = player.getComponent(EntityEquippableComponent.componentId);
	const healthComp = player.getComponent(EntityHealthComponent.componentId);
	const hungerComp = player.getComponent(EntityHungerComponent.componentId);
	
	if (!equip) return;

	const playerId = player.id;
	const night = isNight(timeOfDay);
	const day = isDay(timeOfDay);
	const health = healthComp?.currentValue || 20;
	const maxHealth = healthComp?.maxValue || 20;
	const isLowHealth = health < 10;
	const hunger = hungerComp?.hunger || 20;
	const inWater = player.isInWater;

	// Dark dragon_scale — regeneration at night
	if (night) {
		applyTimedArmorEffect(
			player, equip, playerId,
			"dragonmounts2:dark_dragon_scale_effects",
			"dark_dragon_scale_night_heal",
			"regeneration", 10 * 20, 0, now, 30.0
		);
	}

	// Light dragon_scale — regeneration during day
	if (day) {
		applyTimedArmorEffect(
			player, equip, playerId,
			"dragonmounts2:light_dragon_scale_effects",
			"light_dragon_scale_day_heal",
			"regeneration", 10 * 20, 0, now, 30.0
		);
	}

	// Zombie dragon_scale — strength at night (passive, no cooldown)
	if (night) {
		applyPassiveArmorEffect(
			player, equip,
			"dragonmounts2:zombie_dragon_scale_effects",
			"strength", 15 * 20, 0
		);
	}

	// Forest dragon_scale — regeneration when low health
	if (isLowHealth) {
		applyTimedArmorEffect(
			player, equip, playerId,
			"dragonmounts2:forest_dragon_scale_effects",
			"forest_dragon_scale_low_health_regen",
			"regeneration", 10 * 20, 1, now, 60.0
		);
	}

	// Ender dragon_scale — resistance + strength when low health
	if (isLowHealth && applyTimedArmorEffect(
		player, equip, playerId,
		"dragonmounts2:ender_dragon_scale_effects",
		"ender_dragon_scale_low_health_buff",
		"resistance", 30 * 20, 2, now, 60.0
	)) {
		player.addEffect("strength", 15 * 20, { amplifier: 1, showParticles: true });
	}

	// Water dragon_scale — water breathing when in water (passive)
	if (inWater) {
		applyPassiveArmorEffect(
			player, equip,
			"dragonmounts2:water_dragon_scale_effects",
			"water_breathing", 30 * 20, 0
		);
	}

	// Sunlight dragon_scale — saturation when hungry
	if (hunger < 6) {
		applyPassiveArmorEffect(
			player, equip,
			"dragonmounts2:sunlight_dragon_scale_effects",
			"saturation", 10 * 20, 0
		);
	}

	// Moonlight dragon_scale — night vision (passive, no particles)
	if (isWearingFullSet(equip, "dragonmounts2:moonlight_dragon_scale_effects")) {
		player.addEffect("night_vision", 30 * 20, { amplifier: 0, showParticles: false });
	}

	// Storm set is defined in the lang text as a lightning proc on melee hits, not a slow-fall passive.
	// The actual proc remains handled in the entity hurt logic below.

	// Terra dragon_scale — haste (passive)
	applyPassiveArmorEffect(
		player, equip,
		"dragonmounts2:terra_dragon_scale_effects",
		"haste", 30 * 20, 0
	);

	// Update lore display once per player
	updateDragonArmorLore(player);
}

/**
 * Calculate XP reward dynamically based on entity type and health
 * Uses entity classification and health values instead of static table
 * Applies CONFIG.XP_BOOST_MULTIPLIER for guaranteed XP boost
 * @param {Entity} entity - The entity that died
 * @returns {number} XP amount to award (with 50% boost applied)
 */
function calculateEntityXpReward(entity, applyBonus = false) {
	const typeId = entity.typeId;
	let baseXp = 0;

	// Boss entities get maximum XP
	if (BOSS_ENTITIES.has(typeId)) {
		baseXp = typeId === "minecraft:ender_dragon" 
			? CONFIG.XP_TIER_BOSS_MAJOR 
			: CONFIG.XP_TIER_BOSS;
	} 
	// Hostile mobs get XP based on their health value
	else if (HOSTILE_ENTITIES.has(typeId)) {
		try {
			const healthComp = entity.getComponent(EntityHealthComponent.componentId);
			const maxHealth = healthComp?.maxValue || 20;

			// Scale XP based on max health: weak (low health) to strong (high health)
			if (maxHealth <= 4) {
				baseXp = CONFIG.XP_TIER_HOSTILE_WEAK;
			} else if (maxHealth <= 10) {
				baseXp = CONFIG.XP_TIER_HOSTILE_NORMAL;
			} else {
				baseXp = CONFIG.XP_TIER_HOSTILE_STRONG;
			}
		} catch {
			baseXp = CONFIG.XP_TIER_HOSTILE_NORMAL; // Fallback
		}
	}
	// Non-hostile mobs grant no XP
	else {
		return 0;
	}

	const multiplier = applyBonus ? CONFIG.XP_BOOST_MULTIPLIER : 1;
	return Math.floor(baseXp * multiplier);
}

world.beforeEvents.entityHurt.subscribe(event => {
	if (event.damageSource.cause !== EntityDamageCause.sonicBoom) return;
	if (event.hurtEntity.typeId !== "minecraft:player") return;

	const equip = event.hurtEntity.getComponent(EntityEquippableComponent.componentId);
	if (!equip) return;

	const pieces = countArmorPieces(equip, "dragonmounts2:sculk_dragon_scale_effects");
	if (pieces < 2) return;
	if (pieces >= 4) pendingReflect.set(event.hurtEntity.id, event.damage);

	event.damage *= 0.75;
});

/**
 * Handle entity death and spawn XP orbs
 * Calculates dynamic XP based on entity properties with guaranteed 50% boost
 * Spawns XP orbs at death location immediately (no probability check)
 */
world.afterEvents.entityDie.subscribe(event => {
	const { deadEntity } = event;
	
	// Skip players and invalid entities
	if (deadEntity.typeId === "minecraft:player" || !deadEntity.isValid) return;

	const killer = event.damageSource?.damagingEntity;
	const killerEquip = killer?.getComponent(EntityEquippableComponent.componentId);
	const applyBonusXp = killer?.typeId === "minecraft:player" && isWearingFullSet(killerEquip, "dragonmounts2:enchanted_dragon_scale_effects");

	// Calculate XP dynamically with 50% boost already applied when the killer is wearing the enchanted set
	const xpAmount = calculateEntityXpReward(deadEntity, applyBonusXp);
	if (xpAmount <= 0) return;

	// Always spawn XP orbs (guaranteed, no RNG)
	spawnXpOrbs(deadEntity.dimension, deadEntity.location, xpAmount);
});

function tryTriggerStormLightningProc(player, attacker) {
	if (!player || !attacker || !player.isValid || !attacker.isValid) return false;
	if (player.typeId !== "minecraft:player" || attacker.id === player.id) return false;

	const playerEquip = player.getComponent(EntityEquippableComponent.componentId);
	if (!playerEquip || !isWearingFullSet(playerEquip, "dragonmounts2:storm_dragon_scale_effects")) return false;

	const now = system.currentTick;
	const cooldownExpiry = stormLightningCooldowns.get(player.id) || 0;
	if (cooldownExpiry > now) return false;
	stormLightningCooldowns.set(player.id, now + 60);

	const targetLoc = attacker.location;
	const spawnLoc = {
		x: targetLoc.x,
		y: targetLoc.y + 1,
		z: targetLoc.z,
	};

	try {
		attacker.dimension.spawnEntity("minecraft:lightning_bolt", spawnLoc);
		return true;
	} catch (error) {
		console.warn(`[DM2BP] Failed to spawn storm lightning: ${error?.message || error}`);
		return false;
	}
}

world.afterEvents.entityHurt.subscribe(event => {
	const { hurtEntity, damageSource, damage } = event;
	const isPlayerVictim = hurtEntity.typeId === "minecraft:player";
	const attacker = damageSource.damagingEntity;
	const cause = damageSource.cause;

	if (isPlayerVictim && cause === EntityDamageCause.entityAttack && attacker?.isValid) {
		tryTriggerStormLightningProc(hurtEntity, attacker);
	}

	if (!isPlayerVictim) return;

	const equip = hurtEntity.getComponent(EntityEquippableComponent.componentId);
	if (!equip) return;

	const playerId = hurtEntity.id;
	const now = system.currentTick;
	const isBurning = hurtEntity.isOnFire || cause === EntityDamageCause.fireTick || cause === EntityDamageCause.fire || cause === EntityDamageCause.lava;

	if (isBurning) {
		if (
			isWearingFullSet(equip, "dragonmounts2:fire_dragon_scale_effects") &&
			hurtEntity.getItemCooldown("dragonmounts2:fire_dragon_scale") === 0
		) {
			hurtEntity.addEffect("fire_resistance", 30 * 20, { amplifier: 0, showParticles: true });
			hurtEntity.startItemCooldown("dragonmounts2:fire_dragon_scale", 45.0 * 20);
			system.run(() => updateDragonArmorLore(hurtEntity));
		}
		return;
	}
	if (
		cause === EntityDamageCause.entityAttack &&
		attacker?.isValid &&
		attacker.id !== hurtEntity.id &&
		isWearingFullSet(equip, "dragonmounts2:light_dragon_scale_effects")
	) {
		attacker.addEffect("blindness", 5 * 20, { amplifier: 0, showParticles: true });
	}
	if (
		isWearingFullSet(equip, "dragonmounts2:ice_dragon_scale_effects") &&
		!isCooldownActive(playerId, "ice_dragon_scale_defensive_burst", now) &&
		damageSource.damagingEntity?.isValid
	) {
		let affected = 0;
		applyAoeKnockback(hurtEntity, playerId, 5, 1.5, entity => {
			entity.addEffect("slowness", 10 * 20, { amplifier: 1, showParticles: true });
			entity.applyDamage(1, { cause: EntityDamageCause.magic, damagingEntity: hurtEntity });
			affected++;
		});
		if (affected > 0) {
			setCooldown(playerId, "ice_dragon_scale_defensive_burst", 60.0, now);
			system.run(() => updateDragonArmorLore(hurtEntity));
		}
	}
	if (
		isWearingFullSet(equip, "dragonmounts2:nether_dragon_scale_effects") &&
		damageSource.damagingEntity?.isValid
	) {
		applyAoeKnockback(hurtEntity, playerId, 5, 1.5, entity => {
			entity.setOnFire(10, true);
		});
	}
	if (
		cause === EntityDamageCause.sonicBoom &&
		isWearingFullSet(equip, "dragonmounts2:sculk_dragon_scale_effects")
	) {
		const attacker = damageSource.damagingEntity;
		if (!attacker?.isValid) return;

		const originalDamage = pendingReflect.get(playerId);
		pendingReflect.delete(playerId);

		try {
			attacker.applyDamage((originalDamage ?? damage) * 0.75, {
				cause: EntityDamageCause.magic,
				damagingEntity: hurtEntity,
			});
		} catch (error) {
			console.warn(`Sculk dragon_scale reflect failed: ${error}`);
		}
	}
});


// Only process players with dragon armor
function tickArmorEffects() {
	const now = system.currentTick;
	cleanupExpiredCooldowns(now);

	const timeOfDay = world.getTimeOfDay();

	for (const player of world.getPlayers()) {
		if (!refreshDragonArmorCacheForPlayer(player)) continue;
		processPlayerArmorEffects(player, now, timeOfDay);
	}
	system.runTimeout(tickArmorEffects, 20);
}

system.run(tickArmorEffects);

/**
 * Handle Aether dragon_scale sprint effect
 * Only runs every 10 ticks instead of every tick
 */
function tickAetherSprint() {
	const now = system.currentTick;

	for (const player of world.getPlayers()) {
		if (!refreshDragonArmorCacheForPlayer(player)) continue;
		if (!player.isSprinting) continue;

		const equip = player.getComponent(EntityEquippableComponent.componentId);
		if (!equip) continue;

		// Aether dragon_scale — speed boost while sprinting
		applyTimedArmorEffect(
			player, equip, player.id,
			"dragonmounts2:aether_dragon_scale_effects",
			"aether_dragon_scale_sprint_speed",
			"speed", 5 * 20, 1, now, 15.0
		);
	}
	system.runTimeout(tickAetherSprint, 10);
}

system.run(tickAetherSprint);