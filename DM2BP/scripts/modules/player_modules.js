import {
  world,
  system,
  EquipmentSlot,
  GameMode,
  EntityDamageCause,
  EntityEquippableComponent,
  EntityHealthComponent,
  EntityHungerComponent,
} from "@minecraft/server";
import { dragonArmorLore } from "../data/armor_data.js";
import {
  calculateEntityXpReward,
  spawnXpOrbs,
} from "../utilities/entity_utilities.js";
import { onPlayerLeave, onPlayerSpawn } from "../core/player_lifecycle.js";
import {
  onBeforeEntityHurt,
  onAfterEntityHurt,
} from "../core/combat_events.js";
import { registerIntervalTask } from "../core/scheduler.js";
import { onWorldEvent } from "../core/world_events.js";
import { dragonTypeIds } from "../data/entity_data.js";
import { forgetFormationDragon } from "../utilities/dragon_utilities.js";

const ARMOR_SLOTS = [
  EquipmentSlot.Head,
  EquipmentSlot.Chest,
  EquipmentSlot.Legs,
  EquipmentSlot.Feet,
];

const DRAGON_ARMOR_EFFECT_COMPONENTS = Object.values(dragonArmorLore).map(
  ({ effectsKey }) => effectsKey,
);
const cooldowns = new Map();
const stormLightningCooldowns = new Map();
const pendingSonicBoomDamage = new Map();
const reflectingSonicBoom = new Set();
const CLEANUP_INTERVAL = 1200;
let lastCleanup = 0;

onPlayerLeave(({ playerId }) => {
  cooldowns.delete(playerId);
  stormLightningCooldowns.delete(playerId);
  pendingSonicBoomDamage.delete(playerId);
  reflectingSonicBoom.delete(playerId);
});

function refreshDragonArmorCacheForPlayer(player) {
  if (!player || !player.isValid) return false;

  const equip = player.getComponent(EntityEquippableComponent.componentId);
  const hasArmor = Boolean(equip && hasAnyDragonArmor(equip));

  return hasArmor;
}

function countArmorPieces(equip, componentType) {
  let count = 0;
  for (const slot of ARMOR_SLOTS) {
    if (equip.getEquipmentSlot(slot).getItem()?.getComponent(componentType)) {
      count++;
    }
  }
  return count;
}

onPlayerSpawn(({ player }) => {
  refreshDragonArmorCacheForPlayer(player);
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
    if (!equip.getEquipmentSlot(slot).getItem()?.getComponent(componentType))
      return false;
  }
  return true;
}

function hasAnyDragonArmor(equip) {
  for (const slot of ARMOR_SLOTS) {
    const item = equip.getEquipmentSlot(slot).getItem();
    if (!item) continue;
    for (const componentId of DRAGON_ARMOR_EFFECT_COMPONENTS) {
      if (item.getComponent(componentId)) return true;
    }
  }
  return false;
}

function isNight(timeOfDay) {
  return timeOfDay >= 13000 && timeOfDay < 24000;
}

function applyTimedArmorEffect(
  player,
  equip,
  playerId,
  componentType,
  cooldownKey,
  effectName,
  duration,
  amplifier,
  now,
  cooldownSeconds,
) {
  if (!isWearingFullSet(equip, componentType)) return false;
  if (isCooldownActive(playerId, cooldownKey, now)) return false;

  player.addEffect(effectName, duration, { amplifier, showParticles: true });
  setCooldown(playerId, cooldownKey, cooldownSeconds, now);
  return true;
}

function applyPassiveArmorEffect(
  player,
  equip,
  componentType,
  effectName,
  duration,
  amplifier = 0,
) {
  if (!equip || !isWearingFullSet(equip, componentType)) return;
  player.addEffect(effectName, duration, { amplifier, showParticles: true });
}

function processPlayerArmorEffects(player, now, timeOfDay) {
  const equip = player.getComponent(EntityEquippableComponent.componentId);
  const healthComp = player.getComponent(EntityHealthComponent.componentId);
  const hungerComp = player.getComponent(EntityHungerComponent.componentId);

  if (!equip) return;

  const playerId = player.id;
  const night = isNight(timeOfDay);
  const health = healthComp?.currentValue || 20;
  const isLowHealth = health < 10;
  const hunger = hungerComp?.hunger || 20;
  const inWater = player.isInWater;

  if (night) {
    applyTimedArmorEffect(
      player,
      equip,
      playerId,
      "dragonmounts2:zombie_dragon_scale_effects",
      "zombie_dragon_scale_night_strength",
      "strength",
      15 * 20,
      0,
      now,
      400.0,
    );
  }

  if (isLowHealth) {
    applyTimedArmorEffect(
      player,
      equip,
      playerId,
      "dragonmounts2:forest_dragon_scale_effects",
      "forest_dragon_scale_low_health_regen",
      "regeneration",
      10 * 20,
      1,
      now,
      1200.0,
    );
  }

  if (
    isLowHealth &&
    applyTimedArmorEffect(
      player,
      equip,
      playerId,
      "dragonmounts2:ender_dragon_scale_effects",
      "ender_dragon_scale_low_health_buff",
      "resistance",
      30 * 20,
      2,
      now,
      1200.0,
    )
  ) {
    player.addEffect("strength", 15 * 20, {
      amplifier: 1,
      showParticles: true,
    });
  }

  if (inWater) {
    applyPassiveArmorEffect(
      player,
      equip,
      "dragonmounts2:water_dragon_scale_effects",
      "water_breathing",
      30 * 20,
      0,
    );
  }

  if (hunger < 6) {
    applyTimedArmorEffect(
      player,
      equip,
      playerId,
      "dragonmounts2:sunlight_dragon_scale_effects",
      "sunlight_dragon_scale_hunger",
      "saturation",
      10 * 20,
      0,
      now,
      1200.0,
    );
  }

  if (isWearingFullSet(equip, "dragonmounts2:moonlight_dragon_scale_effects")) {
    player.addEffect("night_vision", 30 * 20, {
      amplifier: 0,
      showParticles: false,
    });
  }

  applyPassiveArmorEffect(
    player,
    equip,
    "dragonmounts2:terra_dragon_scale_effects",
    "haste",
    30 * 20,
    0,
  );

  applyPassiveArmorEffect(
    player,
    equip,
    "dragonmounts2:skeleton_dragon_scale_effects",
    "speed",
    30 * 20,
    0,
  );

  applyPassiveArmorEffect(
    player,
    equip,
    "dragonmounts2:wither_dragon_scale_effects",
    "resistance",
    30 * 20,
    0,
  );
}

function tickDarkDragonGrace() {
  for (const player of world.getPlayers()) {
    if (!player?.isValid) continue;

    const equip = player.getComponent(EntityEquippableComponent.componentId);
    if (
      !equip ||
      !isWearingFullSet(equip, "dragonmounts2:dark_dragon_scale_effects")
    )
      continue;
    if (player.dimension.getLightLevel(player.location) >= 8) continue;

    const health = player.getComponent(EntityHealthComponent.componentId);
    if (health && health.currentValue < health.effectiveMax) {
      health.setCurrentValue(
        Math.min(health.effectiveMax, health.currentValue + 0.5),
      );
    }
  }
}

registerIntervalTask("dark-dragon-grace", 50, tickDarkDragonGrace);

onBeforeEntityHurt((event) => {
  if (event.damageSource.cause !== EntityDamageCause.sonicBoom) return;
  const player = event.hurtEntity;
  if (player.typeId !== "minecraft:player") return;

  const equip = player.getComponent(EntityEquippableComponent.componentId);
  if (!equip) return;

  const pieces = countArmorPieces(
    equip,
    "dragonmounts2:sculk_dragon_scale_effects",
  );
  if (pieces < 2) return;

  if (pieces >= 4) pendingSonicBoomDamage.set(player.id, event.damage);
  event.damage /= pieces;
});

onWorldEvent("afterEvents", "entityDie", (event) => {
  const { deadEntity } = event;

  if (!deadEntity?.isValid || deadEntity.typeId === "minecraft:player") return;

                                                                               
                                                               
  if (dragonTypeIds.has(deadEntity.typeId)) {
    try {
      const ownerId = deadEntity.getDynamicProperty("dragonmounts2:owner_identifier");
      const pid = deadEntity.getDynamicProperty("dragonmounts2:persistent_id");
      if (ownerId && pid) forgetFormationDragon(ownerId, pid);
    } catch {}
  }

  const killer = event.damageSource?.damagingEntity;
  const hasEnchantedArmor = killer?.isValid === true &&
    killer.typeId === "minecraft:player" &&
    isWearingFullSet(
      killer.getComponent(EntityEquippableComponent.componentId),
      "dragonmounts2:enchanted_dragon_scale_effects",
    );
  const xpAmount = calculateEntityXpReward(deadEntity, hasEnchantedArmor);
  if (xpAmount <= 0) return;

  spawnXpOrbs(deadEntity.dimension, deadEntity.location, xpAmount);
});

function tryTriggerStormLightningProc(player, target) {
  if (!player || !target || !player.isValid || !target.isValid)
    return false;
  if (player.typeId !== "minecraft:player" || target.id === player.id)
    return false;
  if (Math.random() < 0.5) return false;

  const playerEquip = player.getComponent(
    EntityEquippableComponent.componentId,
  );
  if (
    !playerEquip ||
    !isWearingFullSet(playerEquip, "dragonmounts2:storm_dragon_scale_effects")
  )
    return false;

  const now = system.currentTick;
  const cooldownExpiry = stormLightningCooldowns.get(player.id) || 0;
  if (cooldownExpiry > now) return false;
  const targetLoc = target.location;
  if (target.dimension.getSkyLightLevel(targetLoc) <= 0) return false;
  const spawnLoc = { x: targetLoc.x, y: targetLoc.y, z: targetLoc.z };

  try {
    target.dimension.spawnEntity("minecraft:lightning_bolt", spawnLoc);
    stormLightningCooldowns.set(player.id, now + 160 * 20);
    return true;
  } catch {
    return false;
  }
}

function triggerArmorRiposte(player, equip, now) {
  const iceComponent = "dragonmounts2:ice_dragon_scale_effects";
  const netherComponent = "dragonmounts2:nether_dragon_scale_effects";
  const iceActive =
    isWearingFullSet(equip, iceComponent) &&
    !isCooldownActive(player.id, "ice_dragon_scale_riposte", now);
  const netherActive =
    isWearingFullSet(equip, netherComponent) &&
    !isCooldownActive(player.id, "nether_dragon_scale_riposte", now);
  if (!iceActive && !netherActive) return;

  const entities = player.dimension
    .getEntities({ location: player.location, maxDistance: 5 })
    .filter((entity) => {
      if (!entity.isValid || entity.id === player.id) return false;
      if (entity.typeId !== "minecraft:player") return true;
      const gameMode = entity.getGameMode();
      return gameMode !== GameMode.creative && gameMode !== GameMode.spectator;
    });
  if (entities.length === 0) return;

  for (const entity of entities) {
    const dx = entity.location.x - player.location.x;
    const dz = entity.location.z - player.location.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 0 && entity.getComponent(EntityHealthComponent.componentId)) {
      const velocity = entity.getVelocity();
      entity.applyImpulse({
        x: velocity.x + (dx / distance) * 0.4,
        y: velocity.y + 0.4,
        z: velocity.z + (dz / distance) * 0.4,
      });
    }

    if (iceActive) {
      if (entity.getComponent(EntityHealthComponent.componentId)) {
        entity.addEffect("slowness", 200, {
          amplifier: 1,
          showParticles: true,
        });
      }
      entity.applyDamage(1, {
        cause: EntityDamageCause.freezing,
        damagingEntity: player,
      });
    }
    if (netherActive) entity.setOnFire(10, true);
  }

  if (iceActive) {
    setCooldown(player.id, "ice_dragon_scale_riposte", 1200, now);
  }
  if (netherActive) {
    setCooldown(player.id, "nether_dragon_scale_riposte", 1200, now);
  }
}

onAfterEntityHurt((event) => {
  const { hurtEntity, damageSource, damage } = event;
  if (!hurtEntity?.isValid) return;
  const isPlayerVictim = hurtEntity.typeId === "minecraft:player";
  const attacker = damageSource.damagingEntity;
  const cause = damageSource.cause;

  if (
    cause === EntityDamageCause.entityAttack &&
    attacker?.isValid &&
    attacker.typeId === "minecraft:player"
  ) {
    tryTriggerStormLightningProc(attacker, hurtEntity);
  }

  if (!isPlayerVictim) return;

  const equip = hurtEntity.getComponent(EntityEquippableComponent.componentId);
  if (!equip) return;
  const now = system.currentTick;

  const isBurning =
    hurtEntity.isOnFire ||
    cause === EntityDamageCause.fireTick ||
    cause === EntityDamageCause.fire ||
    cause === EntityDamageCause.lava;

  triggerArmorRiposte(hurtEntity, equip, now);

  if (isBurning) {
    if (
      isWearingFullSet(equip, "dragonmounts2:fire_dragon_scale_effects") &&
      hurtEntity.getItemCooldown("dragonmounts2:fire_dragon_scale") === 0
    ) {
      hurtEntity.addEffect("fire_resistance", 30 * 20, {
        amplifier: 0,
        showParticles: true,
      });
      hurtEntity.startItemCooldown("dragonmounts2:fire_dragon_scale", 900 * 20);
      hurtEntity.extinguishFire();
    }
    return;
  }

  if (
    cause === EntityDamageCause.entityAttack &&
    attacker?.isValid &&
    attacker.id !== hurtEntity.id &&
    isWearingFullSet(equip, "dragonmounts2:light_dragon_scale_effects")
  ) {
    attacker.addEffect("blindness", 30 * 20, {
      amplifier: 0,
      showParticles: true,
    });
  }

  if (cause === EntityDamageCause.sonicBoom) {
    const reflectionDamage = pendingSonicBoomDamage.get(hurtEntity.id);
    pendingSonicBoomDamage.delete(hurtEntity.id);
    const attacker = damageSource.damagingEntity;

    if (
      isWearingFullSet(equip, "dragonmounts2:sculk_dragon_scale_effects") &&
      attacker?.isValid &&
      !reflectingSonicBoom.has(hurtEntity.id) &&
      Math.hypot(
        attacker.location.x - hurtEntity.location.x,
        attacker.location.z - hurtEntity.location.z,
      ) <= 24 &&
      Math.abs(attacker.location.y - hurtEntity.location.y) <= 32
    ) {
      reflectingSonicBoom.add(hurtEntity.id);
      try {
        attacker.applyDamage((reflectionDamage ?? damage) * 0.75, {
          cause: EntityDamageCause.sonicBoom,
          damagingEntity: hurtEntity,
        });
      } finally {
        reflectingSonicBoom.delete(hurtEntity.id);
      }
    }
  }
});

function tickArmorEffects() {
  const now = system.currentTick;
  cleanupExpiredCooldowns(now);

  const timeOfDay = world.getTimeOfDay();

  for (const player of world.getPlayers()) {
    if (!player?.isValid) continue;
    try {
      if (!refreshDragonArmorCacheForPlayer(player)) continue;
      processPlayerArmorEffects(player, now, timeOfDay);
    } catch {}
  }
}

registerIntervalTask("dragon-armor-effects", 20, tickArmorEffects);

function tickAetherSprint() {
  const now = system.currentTick;

  for (const player of world.getPlayers()) {
    if (!player?.isValid) continue;
    try {
      if (!refreshDragonArmorCacheForPlayer(player)) continue;
      if (!player.isSprinting) continue;

      const equip = player.getComponent(EntityEquippableComponent.componentId);
      if (!equip) continue;

      applyTimedArmorEffect(
        player,
        equip,
        player.id,
        "dragonmounts2:aether_dragon_scale_effects",
        "aether_dragon_scale_sprint_speed",
        "speed",
        5 * 20,
        1,
        now,
        300.0,
      );
    } catch {}
  }
}

registerIntervalTask("aether-sprint-effects", 10, tickAetherSprint);
