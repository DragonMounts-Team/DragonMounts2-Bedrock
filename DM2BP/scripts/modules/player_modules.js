import {
  world,
  system,
  EquipmentSlot,
  EntityDamageCause,
  EntityEquippableComponent,
  EntityHealthComponent,
  EntityHungerComponent,
  EntityTameableComponent,
  Player,
} from "@minecraft/server";
import { dragonArmorLore } from "../data/armor_data.js";
import {
  applyAoeKnockback,
  calculateEntityXpReward,
  spawnXpOrbs,
} from "../utilities/entity_utilities.js";

const ARMOR_SLOTS = [
  EquipmentSlot.Head,
  EquipmentSlot.Chest,
  EquipmentSlot.Legs,
  EquipmentSlot.Feet,
];

const DRAGON_ARMOR_LORE_ENTRIES = Object.entries(dragonArmorLore);
const cooldowns = new Map();
const pendingReflect = new Map();
const stormLightningCooldowns = new Map();
const CLEANUP_INTERVAL = 1200;
let lastCleanup = 0;

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  cooldowns.delete(playerId);
  pendingReflect.delete(playerId);
  stormLightningCooldowns.delete(playerId);
});

function refreshDragonArmorCacheForPlayer(player) {
  if (!player || !player.isValid) return false;

  const equip = player.getComponent(EntityEquippableComponent.componentId);
  const hasArmor = Boolean(equip && hasAnyDragonArmor(equip));

  return hasArmor;
}

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
    if (!equip.getEquipmentSlot(slot).getItem()?.getComponent(componentType))
      return false;
  }
  return true;
}

function hasAnyDragonArmor(equip) {
  for (const slot of ARMOR_SLOTS) {
    const item = equip.getEquipmentSlot(slot).getItem();
    if (!item) continue;
    for (const [, data] of DRAGON_ARMOR_LORE_ENTRIES) {
      if (item.getComponent(data.effectsKey)) return true;
    }
  }
  return false;
}

function countArmorPieces(equip, componentType) {
  let count = 0;
  for (const slot of ARMOR_SLOTS) {
    if (equip.getEquipmentSlot(slot).getItem()?.getComponent(componentType))
      count++;
  }
  return count;
}
function applyDragonLoreToItem(item, fullSetMap, pieceCountMap) {
  for (const [componentId, data] of DRAGON_ARMOR_LORE_ENTRIES) {
    if (!item.getComponent(componentId)) continue;

    const lore = [];

    if (data.tiers) {
      const pieceCount = pieceCountMap.get(componentId) ?? 0;
      for (const tier of data.tiers) {
        const color = pieceCount >= tier.threshold ? "§a" : "§7";
        lore.push({
          rawtext: [
            { text: color, italic: false },
            {
              translate: `tooltip.${data.setKey}.lore.set${tier.suffix}`,
              italic: false,
            },
          ],
        });
        lore.push({
          rawtext: [
            { text: "§f", italic: false },
            {
              translate: `tooltip.${data.setKey}.lore.disc${tier.suffix}`,
              italic: false,
            },
          ],
        });
      }
    } else {
      const color = (fullSetMap.get(componentId) ?? false) ? "§a" : "§7";
      lore.push({
        rawtext: [
          { text: color, italic: false },
          { translate: `tooltip.${data.setKey}.lore.set`, italic: false },
        ],
      });
      lore.push({
        rawtext: [
          { text: "§f", italic: false },
          { translate: `tooltip.${data.setKey}.lore.disc`, italic: false },
        ],
      });
    }

    if (data.maxCd !== null) {
      lore.push({
        rawtext: [
          { text: "§f", italic: false },
          { translate: "tooltip.dragonmounts2.cooldown", italic: false },
          { text: ` ${data.maxCd.toFixed(1)}`, italic: false },
          { translate: "tooltip.dragonmounts2.seconds", italic: false },
        ],
      });
    }

    item.setLore(lore);
    return item;
  }
  return null;
}

function updateDragonArmorLore(player) {
  if (!player?.isValid) return;
  const equip = player.getComponent(EntityEquippableComponent.componentId);
  if (!equip) return;

  const fullSetMap = new Map();
  const pieceCountMap = new Map();

  for (const [componentId, data] of DRAGON_ARMOR_LORE_ENTRIES) {
    fullSetMap.set(componentId, isWearingFullSet(equip, data.effectsKey));
    if (data.tiers)
      pieceCountMap.set(componentId, countArmorPieces(equip, data.effectsKey));
  }

  for (const slot of ARMOR_SLOTS) {
    const item = equip.getEquipmentSlot(slot).getItem();
    if (!item) continue;
    const modified = applyDragonLoreToItem(item, fullSetMap, pieceCountMap);
    if (modified) equip.getEquipmentSlot(slot).setItem(modified);
  }

  const mainhand = equip.getEquipmentSlot(EquipmentSlot.Mainhand).getItem();
  if (mainhand) {
    const modified = applyDragonLoreToItem(mainhand, fullSetMap, pieceCountMap);
    if (modified)
      equip.getEquipmentSlot(EquipmentSlot.Mainhand).setItem(modified);
  }

  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return;

  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);
    if (!item) continue;
    const modified = applyDragonLoreToItem(item, fullSetMap, pieceCountMap);
    if (modified) container.setItem(i, modified);
  }
}
function isNight(timeOfDay) {
  return timeOfDay >= 12000 && timeOfDay < 24000;
}

function isDay(timeOfDay) {
  return timeOfDay >= 0 && timeOfDay < 12000;
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
  system.run(() => updateDragonArmorLore(player));
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
  const day = isDay(timeOfDay);
  const health = healthComp?.currentValue || 20;
  const isLowHealth = health < 10;
  const hunger = hungerComp?.hunger || 20;
  const inWater = player.isInWater;

  if (night) {
    applyTimedArmorEffect(
      player,
      equip,
      playerId,
      "dragonmounts2:dark_dragon_scale_effects",
      "dark_dragon_scale_night_heal",
      "regeneration",
      10 * 20,
      0,
      now,
      30.0,
    );
  }

  if (day) {
    applyTimedArmorEffect(
      player,
      equip,
      playerId,
      "dragonmounts2:light_dragon_scale_effects",
      "light_dragon_scale_day_heal",
      "regeneration",
      10 * 20,
      0,
      now,
      30.0,
    );
  }

  if (night) {
    applyPassiveArmorEffect(
      player,
      equip,
      "dragonmounts2:zombie_dragon_scale_effects",
      "strength",
      15 * 20,
      0,
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
      60.0,
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
      60.0,
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
    applyPassiveArmorEffect(
      player,
      equip,
      "dragonmounts2:sunlight_dragon_scale_effects",
      "saturation",
      10 * 20,
      0,
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

  updateDragonArmorLore(player);
}

world.beforeEvents.entityHurt.subscribe((event) => {
  if (event.damageSource.cause !== EntityDamageCause.sonicBoom) return;
  if (event.hurtEntity.typeId !== "minecraft:player") return;

  const equip = event.hurtEntity.getComponent(
    EntityEquippableComponent.componentId,
  );
  if (!equip) return;

  const pieces = countArmorPieces(
    equip,
    "dragonmounts2:sculk_dragon_scale_effects",
  );
  if (pieces < 2) return;
  if (pieces >= 4) pendingReflect.set(event.hurtEntity.id, event.damage);

  event.damage *= 0.75;
});

world.afterEvents.entityDie.subscribe((event) => {
  const { deadEntity } = event;

  if (deadEntity.typeId === "minecraft:player" || !deadEntity.isValid) return;

  const killer = event.damageSource?.damagingEntity;
  const killerEquip = killer?.getComponent(
    EntityEquippableComponent.componentId,
  );
  const applyBonusXp =
    killer?.typeId === "minecraft:player" &&
    isWearingFullSet(
      killerEquip,
      "dragonmounts2:enchanted_dragon_scale_effects",
    );

  const xpAmount = calculateEntityXpReward(deadEntity, applyBonusXp);
  if (xpAmount <= 0) return;

  spawnXpOrbs(deadEntity.dimension, deadEntity.location, xpAmount);
});

function tryTriggerStormLightningProc(player, attacker) {
  if (!player || !attacker || !player.isValid || !attacker.isValid)
    return false;
  if (player.typeId !== "minecraft:player" || attacker.id === player.id)
    return false;

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
  } catch {
    return false;
  }
}

world.afterEvents.entityHurt.subscribe((event) => {
  const { hurtEntity, damageSource, damage } = event;
  if (!hurtEntity?.isValid) return;
  const isPlayerVictim = hurtEntity.typeId === "minecraft:player";
  const attacker = damageSource.damagingEntity;
  const cause = damageSource.cause;

  if (
    isPlayerVictim &&
    cause === EntityDamageCause.entityAttack &&
    attacker?.isValid
  ) {
    tryTriggerStormLightningProc(hurtEntity, attacker);
  }

  if (!isPlayerVictim) return;

  const equip = hurtEntity.getComponent(EntityEquippableComponent.componentId);
  if (!equip) return;

  const playerId = hurtEntity.id;
  const now = system.currentTick;
  const isBurning =
    hurtEntity.isOnFire ||
    cause === EntityDamageCause.fireTick ||
    cause === EntityDamageCause.fire ||
    cause === EntityDamageCause.lava;

  if (isBurning) {
    if (
      isWearingFullSet(equip, "dragonmounts2:fire_dragon_scale_effects") &&
      hurtEntity.getItemCooldown("dragonmounts2:fire_dragon_scale") === 0
    ) {
      hurtEntity.addEffect("fire_resistance", 30 * 20, {
        amplifier: 0,
        showParticles: true,
      });
      hurtEntity.startItemCooldown(
        "dragonmounts2:fire_dragon_scale",
        45.0 * 20,
      );
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
    attacker.addEffect("blindness", 5 * 20, {
      amplifier: 0,
      showParticles: true,
    });
  }
  if (
    isWearingFullSet(equip, "dragonmounts2:ice_dragon_scale_effects") &&
    !isCooldownActive(playerId, "ice_dragon_scale_defensive_burst", now) &&
    damageSource.damagingEntity?.isValid
  ) {
    let affected = 0;
    applyAoeKnockback(hurtEntity, playerId, 5, 1.5, (entity) => {
      entity.addEffect("slowness", 10 * 20, {
        amplifier: 1,
        showParticles: true,
      });
      entity.applyDamage(1, {
        cause: EntityDamageCause.magic,
        damagingEntity: hurtEntity,
      });
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
    applyAoeKnockback(hurtEntity, playerId, 5, 1.5, (entity) => {
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
    } catch {}
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
  system.runTimeout(tickArmorEffects, 20);
}

system.run(tickArmorEffects);

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
        15.0,
      );
    } catch {}
  }
  system.runTimeout(tickAetherSprint, 10);
}

system.run(tickAetherSprint);
