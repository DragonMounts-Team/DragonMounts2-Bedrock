import {
  world,
  system,
  ItemStack,
  Player,
  EquipmentSlot,
  EntityEquippableComponent,
  ItemDurabilityComponent,
  ItemEnchantableComponent,
  GameMode,
} from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import * as entityArrays from "../arrays/entity_arrays.js";
import * as entityData from "../data/entity_data.js";
import * as itemData from "../data/item_data.js";
import { distanceBetween, getPersistentId } from "./entity_utilities.js";
import * as dragonUtilities from "./dragon_utilities.js";
import { compareByAge } from "./formation_order.js";
import { spawnParticle } from "./particle_utilities.js";
import {
  getWorldDragonEggHatchSpeed,
  getSoundOptions,
} from "../data/settings.js";

class CustomForm {
  constructor(player, title) {
    this.player = player;
    this.form = new ActionFormData().title(title);
    this.callbacks = [];
  }

  label(body) {
    this.form.body(body);
    return this;
  }

  button(text, iconPathOrCallback, callback) {
    const iconPath =
      typeof iconPathOrCallback === "function" ? undefined : iconPathOrCallback;
    const handler =
      typeof iconPathOrCallback === "function" ? iconPathOrCallback : callback;
    this.form.button(text, iconPath);
    this.callbacks.push(handler);
    return this;
  }

  close() {}

  show() {
    return this.form.show(this.player).then((response) => {
      if (response.canceled || response.selection === undefined)
        return response;
      this.callbacks[response.selection]?.();
      return response;
    });
  }
}

const TELEPORT_AIR_TYPES = new Set(entityArrays.teleportAirTypes);

function runCaptureCommand(entity, command) {
  const result = entity.runCommand(command);
  if (result && result.successCount === 0) {
    throw new Error(`command failed: ${command.split(" ")[0]}`);
  }
}

function dismountRiders(dragon) {
  try {
    for (const player of dragon.dimension.getPlayers({
      location: dragon.location,
      maxDistance: 16,
    })) {
      try {
        const mount = player.getComponent("minecraft:riding")?.entityRidingOn;
        if (mount?.id === dragon.id) player.runCommand("ride @s stop_riding");
      } catch {}
    }
  } catch {}
}

function getMainhandSlot(player) {
  return player
    ?.getComponent(EntityEquippableComponent.componentId)
    ?.getEquipmentSlot(EquipmentSlot.Mainhand);
}

                                                                            
                                                                    
function nameText(name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
                                                                               
                           
  return trimmed && trimmed !== "Unnamed"
    ? { text: trimmed }
    : { translate: "tooltip.dragonmounts2:unnamed" };
}

function getEntityName(entity) {
  return entity?.nameTag?.trim() || "Unnamed";
}

const SCEPTER_HATCH_RADIUS = 6;
const SCEPTER_HATCH_DURATION = 10 * 60 * 20;
const SCEPTER_HATCH_SOUND = "dragonmounts2:item.spell_loop";
const SCEPTER_HATCH_SOUND_FADE = 10 * 20;
const SCEPTER_HEAL_RADIUS = 7;
const SCEPTER_HEAL_DURATION = 15 * 20;
const scepterHatchZones = new Map();

function playScepterCastAnimation(player) {
  if (!player?.isValid) return;
  player.playAnimation("animation.dragonmounts2.player.scepter_slam", {
    blendOutTime: 0.15,
  });
  player.startItemCooldown("dragonmounts2:dragon_scepter", 30);
}

function spawnHatchCastVisuals(dimension, location) {
  spawnScepterMagicPattern(
    dimension,
    location,
    "dragonmounts2:spell_hatchspeed",
  );
  spawnParticle(dimension, "minecraft:totem_particle", {
    x: location.x,
    y: location.y + 1.1,
    z: location.z,
  });
}

function spawnScepterMagicPattern(dimension, origin, particle) {
  spawnParticle(dimension, particle, {
    x: origin.x,
    y: origin.y + 0.05,
    z: origin.z,
  });
}

function getHeldScepter(player) {
  const item = getMainhandSlot(player)?.getItem();
  return item?.typeId === "dragonmounts2:dragon_scepter" ? item : undefined;
}

function damageScepter(player, amount) {
  if (!player?.isValid) return false;
  const slot = getMainhandSlot(player);
  const item = slot?.getItem();
  const durability = item?.getComponent(ItemDurabilityComponent.componentId);
  if (!slot || item?.typeId !== "dragonmounts2:dragon_scepter" || !durability)
    return false;
  if (player.getGameMode() === GameMode.creative) return true;
  if (durability.damage + amount >= durability.maxDurability) {
    slot.setItem(undefined);
    player.playSound("random.break", getSoundOptions());
    return false;
  }
  durability.damage += amount;
  slot.setItem(item);
  return true;
}

function repairScepter(player) {
  const slot = getMainhandSlot(player);
  const item = slot?.getItem();
  const durability = item?.getComponent(ItemDurabilityComponent.componentId);
  if (
    item?.typeId !== "dragonmounts2:dragon_scepter" ||
    !durability ||
    durability.damage <= 0
  )
    return;
  const block = player.dimension.getBlock({
    x: Math.floor(player.location.x),
    y: Math.floor(player.location.y) - 1,
    z: Math.floor(player.location.z),
  });
  const nearXp =
    player.dimension.getEntities({
      type: "minecraft:xp_orb",
      location: player.location,
      maxDistance: 4,
    }).length > 0;
  if (
    !["minecraft:bookshelf", "minecraft:enchanting_table"].includes(
      block?.typeId,
    ) &&
    !nearXp
  )
    return;
  durability.damage--;
  slot.setItem(item);
}

export function tickDragonScepterAbilities() {
  const tick = system.currentTick;
  for (const [playerId, zone] of scepterHatchZones) {
    if (zone.expiresAt <= tick) {
      const player = world
        .getAllPlayers()
        .find((candidate) => candidate.id === playerId);
      player?.runCommand(`stopsound @s ${SCEPTER_HATCH_SOUND}`);
      scepterHatchZones.delete(playerId);
      continue;
    }
    if (tick % 20 !== 0) continue;
    const remaining = zone.expiresAt - tick;
    const volume =
      remaining < SCEPTER_HATCH_SOUND_FADE
        ? Math.max(0.05, remaining / SCEPTER_HATCH_SOUND_FADE)
        : 0.8;
    zone.dimension.playSound(
      SCEPTER_HATCH_SOUND,
      zone.location,
      getSoundOptions({ volume }),
    );
    const hatchSpeed = getWorldDragonEggHatchSpeed();
    for (const egg of zone.dimension.getEntities({
      families: ["dragon_egg"],
      location: zone.location,
      maxDistance: SCEPTER_HATCH_RADIUS,
    })) {
      const eggOwnerId = egg.getDynamicProperty(
        "dragonmounts2:hatch_owner_identifier",
      );
      if (eggOwnerId && eggOwnerId !== playerId) continue;
      if (egg.getProperty("dragonmounts2:egg_hatch_speed") !== hatchSpeed) {
        egg.setProperty("dragonmounts2:egg_hatch_speed", hatchSpeed);
      }
      if (
        (Number(egg.getProperty("dragonmounts2:egg_hatch_time")) || 0) < 0.3
      ) {
        egg.triggerEvent("minecraft:increase_dragon_egg_hatch_time");
      }
    }
  }
  if (tick % 40 === 0) {
    for (const player of world.getAllPlayers()) repairScepter(player);
  }
}

function abilityMessage(player, key) {
  player.onScreenDisplay.setActionBar({
    rawtext: [{ text: "§a" }, { translate: key }],
  });
  player.dimension.playSound(
    "random.levelup",
    player.location,
    getSoundOptions(),
  );
}

function useScepterHatchSpeed(player) {
  if (scepterHatchZones.has(player.id)) {
    abilityMessage(
      player,
      "tooltip.dragonmounts2:dragon_scepter.hatch_speed_active",
    );
    return;
  }
  if (!damageScepter(player, 8)) return;
  playScepterCastAnimation(player);
  const location = {
    x: Math.floor(player.location.x) + 0.5,
    y: Math.floor(player.location.y),
    z: Math.floor(player.location.z) + 0.5,
  };
  player.runCommand(`stopsound @s ${SCEPTER_HATCH_SOUND}`);
  scepterHatchZones.set(player.id, {
    dimension: player.dimension,
    location,
    expiresAt: system.currentTick + SCEPTER_HATCH_DURATION,
  });
  spawnHatchCastVisuals(player.dimension, location);
  abilityMessage(
    player,
    "tooltip.dragonmounts2:dragon_scepter.hatch_speed_active",
  );
}

function useScepterHeal(player) {
  if (!damageScepter(player, 6)) return;
  playScepterCastAnimation(player);
  spawnScepterMagicPattern(
    player.dimension,
    player.location,
    "dragonmounts2:spell_healing",
  );
  const nearbyTamedEntities = player.dimension
    .getEntities({
      location: player.location,
      maxDistance: SCEPTER_HEAL_RADIUS,
    })
    .filter(
      (entity) => entity.getComponent("minecraft:tameable")?.isTamed === true,
    );
  const targets = [player, ...nearbyTamedEntities];
  for (const target of targets) {
    target.addEffect("regeneration", SCEPTER_HEAL_DURATION, {
      amplifier: 1,
      showParticles: false,
    });
  }
  abilityMessage(player, "tooltip.dragonmounts2:dragon_scepter.healing_active");
}

function showDragonScepterAbilityUI(source) {
  const menuTitle = {
    rawtext: [
      { text: "§5§l" },
      { translate: "tooltip.dragonmounts2:dragon_scepter.abilities_name" },
    ],
  };
  const form = new CustomForm(source, menuTitle)
    .button(
      {
        rawtext: [
          { text: "§d[+] §f" },
          { translate: "tooltip.dragonmounts2:dragon_scepter.hatch_speed" },
        ],
      },
      "textures/ui/dragonmounts2/dragon_scepter/hatch_speed",
      () => system.run(() => useScepterHatchSpeed(source)),
    )
    .button(
      {
        rawtext: [
          { text: "§a[+] §f" },
          { translate: "tooltip.dragonmounts2:dragon_scepter.heal" },
        ],
      },
      "textures/ui/dragonmounts2/dragon_scepter/heal",
      () => system.run(() => useScepterHeal(source)),
    );
  form.show().catch((error) => console.error(error));
}

export function dragonFluteUse(itemStack, source, params) {
  if (!(source instanceof Player)) return;

  const rule = params;

  const binding = getDragonFluteBinding(itemStack);
  if (binding?.ownerIdentifier && binding.ownerIdentifier !== source.id) {
    return source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        { translate: `${rule.translates.owned_by}` },
        { text: `${binding.ownerName}` },
      ],
    });
  }

  showDragonFluteUI(source, itemStack, rule);
}

function toggleFormationFlight(source, itemStack = null) {
  const enabled = !dragonUtilities.isFormationFlightEnabled(source);
  dragonUtilities.setFormationFlightEnabled(source, enabled);
  // Enabling from a scepter limits the V to the dragons bound to that scepter.
  if (enabled && itemStack) {
    dragonUtilities.setFormationRoster(source, getDragonScepterBinding(itemStack).dragonIds);
  }
  announceVFlight(source, enabled);
}

function announceVFlight(source, enabled) {
  source.onScreenDisplay.setActionBar({
    rawtext: [
      { text: enabled ? "§a" : "§e" },
      { translate: enabled ? "tooltip.dragonmounts2:flight_rank.vflight_state_on" : "tooltip.dragonmounts2:flight_rank.vflight_state_off" },
    ],
  });
  source.dimension.playSound("random.click", source.location, getSoundOptions());
}

function flightRankText(rank) {
  return rank > 0
    ? { translate: "tooltip.dragonmounts2:flight_rank.value", with: [String(rank)] }
    : { translate: "tooltip.dragonmounts2:flight_rank.auto" };
}

function announceFlightRank(source, dragonName, rank) {
  source.onScreenDisplay.setActionBar({
    rawtext: [
      { text: "§a" },
      { translate: "tooltip.dragonmounts2:flight_rank.set" },
      { text: " " },
      dragonName,
      { text: ": " },
      flightRankText(rank),
    ],
  });
  source.dimension.playSound("random.click", source.location, getSoundOptions());
}

export function dragonScepterCompleteUse(itemStack, source, params) {
  if (!source?.isValid) return;

  if (params.sounds?.spell) {
    system.run(() => {
      source.dimension.playSound(
        params.sounds.spell,
        source.location,
        getSoundOptions(),
      );
    });
  }

  const boundDragons = getOwnedBoundScepterDragons(source, itemStack, params);
  if (getRidingDragon(source, params)) {
    if (boundDragons.length || getDragonScepterBinding(itemStack).dragonIds.length) {
      return showDragonScepterUI(source, itemStack, params);
    }
    return source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        { translate: `${params.translates.not_bound}` },
      ],
    });
  }

  const viewTarget = source.getEntitiesFromViewDirection({
    maxDistance: params.max_distance ?? 32,
    ignoreBlockCollision: false,
    includePassableBlocks: false,
    families: ["dragonmounts2"],
  })?.[0]?.entity;
  if (
    !viewTarget?.isValid ||
    !params.dragon_types?.includes(viewTarget.typeId)
  ) {
    return showDragonScepterAbilityUI(source);
  }

  return changeDragonVariant(source, params);
}

function getRidingDragon(source, rule) {
  if (!source?.isValid) return null;
  const mountedDragon = source.getComponent("minecraft:riding")?.entityRidingOn;
  if (!mountedDragon?.isValid) return null;
  if (rule?.dragon_types && !rule.dragon_types.includes(mountedDragon.typeId))
    return null;
  return mountedDragon;
}

function changeDragonVariant(source, rule) {
  const results = source.getEntitiesFromViewDirection({
    maxDistance: rule.max_distance ?? 32,
    ignoreBlockCollision: false,
    includePassableBlocks: false,
    families: ["dragonmounts2"],
  });
  const dragon = results?.[0]?.entity;
  if (!dragon?.isValid || !rule.dragon_types?.includes(dragon.typeId)) {
    return source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        { translate: `${rule.translates.selected_mobs}` },
      ],
    });
  }

  const tameable = dragon.getComponent("minecraft:tameable");
  const dragonName = nameText(dragon.nameTag);
  if (!tameable) {
    return source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        {
          translate: "tooltip.dragonmounts2:dragon_scepter.untameable",
          with: { rawtext: [dragonName] },
        },
      ],
    });
  }
  if (!tameable.isTamed) {
    return source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        {
          translate: "tooltip.dragonmounts2:dragon_scepter.untamed",
          with: { rawtext: [dragonName] },
        },
      ],
    });
  }
  if (tameable.tamedToPlayerId !== source.id) {
    return source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        { translate: `${rule.translates.not_owned}`, with: { rawtext: [dragonName] } },
      ],
    });
  }

  const denyVariant = entityData.dragonVariantDenyTypes[dragon.typeId];
  if (
    denyVariant &&
    dragon.getProperty("dragonmounts2:variant_type") === denyVariant
  ) {
    return source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        {
          translate:
            "tooltip.dragonmounts2:dragon_scepter.variant_unchangeable",
          with: { rawtext: [dragonName] },
        },
      ],
    });
  }

  dragon.triggerEvent("minecraft:on_variant");
  itemToolDamage(
    source
      .getComponent(EntityEquippableComponent.componentId)
      .getEquipmentSlot(EquipmentSlot.Mainhand)
      .getItem(),
    source,
  );
  return source.onScreenDisplay.setActionBar({
    rawtext: [
      {
        translate: "tooltip.dragonmounts2:dragon_scepter.variant_changed",
        with: { rawtext: [dragonName] },
      },
    ],
  });
}

export function dragonScepterUse(itemStack, source, params) {
  if (params.sounds?.cast) {
    system.run(() => {
      source.dimension.playSound(
        params.sounds.cast,
        source.location,
        getSoundOptions(),
      );
    });
  }
}

export function dragonScepterHitEntity(
  attackingEntity,
  hitEntity,
  itemStack,
  params,
) {
  if (!(attackingEntity instanceof Player) || !hitEntity?.isValid) return;

  const rule = params;
  if (!rule.dragon_types?.includes(hitEntity.typeId)) {
    return attackingEntity.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        { translate: `${rule.translates.selected_mobs}` },
      ],
    });
  }

  if (!hitEntity.hasComponent("minecraft:is_tamed")) {
    return attackingEntity.onScreenDisplay.setActionBar({
      rawtext: [{ text: "§c" }, { translate: `${rule.translates.untamed}` }],
    });
  }

  const ownerIdentifier = hitEntity.getDynamicProperty(
    "dragonmounts2:owner_identifier",
  );
  if (ownerIdentifier && ownerIdentifier !== attackingEntity.id) {
    return attackingEntity.onScreenDisplay.setActionBar({
      rawtext: [{ text: "§c" }, { translate: `${rule.translates.not_owned}` }],
    });
  }

  if (!ownerIdentifier) {
    hitEntity.setDynamicProperty(
      "dragonmounts2:owner_identifier",
      attackingEntity.id,
    );
  }

  system.run(() => {
    if (!hitEntity.isValid) return;

    const pid = getPersistentId(hitEntity);
    if (!pid) return;

    const scepterOwnerIdentifier = hitEntity.getDynamicProperty(
      "dragonmounts2:dragon_scepter_owner_identifier",
    );
    if (
      scepterOwnerIdentifier &&
      scepterOwnerIdentifier !== attackingEntity.id
    ) {
      return attackingEntity.onScreenDisplay.setActionBar({
        rawtext: [
          { text: "§c" },
          { translate: `${rule.translates.bounded_other_owner}` },
        ],
      });
    }

    const boundDragonIds = getDragonScepterBinding(itemStack).dragonIds || [];
    if (boundDragonIds.includes(pid)) {
      unbindDragonScepter(attackingEntity, hitEntity, itemStack, pid, rule);
      attackingEntity.onScreenDisplay.setActionBar({
        rawtext: [{ text: "§e" }, { translate: `${rule.translates.unbound}` }],
      });
      attackingEntity.dimension.playSound(
        "random.break",
        attackingEntity.location,
        getSoundOptions(),
      );
    } else {
      const bound = bindDragonScepter(
        attackingEntity,
        hitEntity,
        itemStack,
        pid,
        rule,
      );
      if (bound) {
        attackingEntity.onScreenDisplay.setActionBar({
          rawtext: [{ text: "§e" }, { translate: `${rule.translates.bound}` }],
        });
        attackingEntity.dimension.playSound(
          "random.levelup",
          attackingEntity.location,
          getSoundOptions(),
        );
      }
    }
  });
}

function bindDragonScepter(attackingEntity, hitEntity, itemStack, pid, rule) {
  if (!attackingEntity?.isValid || !hitEntity?.isValid) return false;

  const equippable = attackingEntity.getComponent(
    EntityEquippableComponent.componentId,
  );
  if (!equippable) return false;

  const mainhand = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
  const itemName = itemStack.nameTag;
  const dragonScepterItem = new ItemStack(itemStack.typeId);
  const dragonName = getEntityName(hitEntity);

  const existingIds = getDragonScepterBinding(itemStack).dragonIds || [];
  const alreadyBound = existingIds.includes(pid);
  if (alreadyBound) {
    const nextIds = existingIds.filter((id) => id !== pid);
    dragonScepterItem.setDynamicProperty(
      "dragonmounts2:dragon_scepter_dragons",
      nextIds.join(","),
    );
    dragonScepterItem.setDynamicProperty(
      "dragonmounts2:owner_name",
      attackingEntity.name,
    );
    dragonScepterItem.setDynamicProperty(
      "dragonmounts2:owner_identifier",
      attackingEntity.id,
    );
    dragonScepterItem.nameTag = itemName;
    mainhand.setItem(dragonScepterItem);
    return false;
  }

  if (existingIds.length >= 4) {
    attackingEntity.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        { translate: "tooltip.dragonmounts2:dragon_scepter.max_dragons" },
      ],
    });
    return false;
  }

  const nextIds = [...existingIds, pid];
  dragonScepterItem.setDynamicProperty(
    "dragonmounts2:dragon_scepter_dragons",
    nextIds.join(","),
  );
  dragonScepterItem.setDynamicProperty(
    "dragonmounts2:owner_name",
    attackingEntity.name,
  );
  dragonScepterItem.setDynamicProperty(
    "dragonmounts2:owner_identifier",
    attackingEntity.id,
  );
  dragonScepterItem.setDynamicProperty("dragonmounts2:dragon_name", dragonName);
  dragonScepterItem.setDynamicProperty("dragonmounts2:dragon_identifier", pid);

  hitEntity.setDynamicProperty(
    "dragonmounts2:dragon_scepter_owner_identifier",
    attackingEntity.id,
  );
  hitEntity.setDynamicProperty(
    "dragonmounts2:dragon_scepter_type",
    itemStack.typeId,
  );

  const boundDragonsLore = buildScepterLore(
    attackingEntity,
    nextIds,
    attackingEntity.dimension,
    rule,
  );
  dragonScepterItem.setLore(boundDragonsLore);

  dragonScepterItem.nameTag = itemName;
  mainhand.setItem(dragonScepterItem);
  return true;
}

function unbindDragonScepter(attackingEntity, hitEntity, itemStack, pid, rule) {
  if (!attackingEntity?.isValid) return;

  const equippable = attackingEntity.getComponent(
    EntityEquippableComponent.componentId,
  );
  if (!equippable) return;

  const mainhand = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
  const dragonScepterItem = new ItemStack(itemStack.typeId);
  const existingIds = getDragonScepterBinding(itemStack).dragonIds || [];
  const nextIds = existingIds.filter((id) => id !== pid);
  dragonScepterItem.setDynamicProperty(
    "dragonmounts2:dragon_scepter_dragons",
    nextIds.join(","),
  );
  dragonScepterItem.setDynamicProperty(
    "dragonmounts2:owner_name",
    attackingEntity.name,
  );
  dragonScepterItem.setDynamicProperty(
    "dragonmounts2:owner_identifier",
    attackingEntity.id,
  );
  dragonScepterItem.nameTag = itemStack.nameTag;
  const boundDragonsLore = buildScepterLore(
    attackingEntity,
    nextIds,
    attackingEntity.dimension,
    rule,
  );
  dragonScepterItem.setLore(boundDragonsLore);
  mainhand.setItem(dragonScepterItem);
  hitEntity.setDynamicProperty(
    "dragonmounts2:dragon_scepter_owner_identifier",
    "",
  );
  hitEntity.setDynamicProperty("dragonmounts2:dragon_scepter_type", "");
}

function buildScepterLore(attackingEntity, dragonIds, dimension, rule) {
  const lines = [];
  if (!dragonIds?.length) return [];
  for (const pid of dragonIds) {
    const dragon = dimension
      ?.getEntities({ families: ["dragonmounts2"] })
      .find((entity) => entity?.isValid && getPersistentId(entity) === pid);
    lines.push({
      rawtext: [{ text: "§r§7" }, { translate: `${rule.translates.bound_to}` }],
    });
    lines.push({
      rawtext: [{ text: "§r§9 " }, nameText(dragon?.isValid ? dragon.nameTag : "")],
    });
    lines.push(`§r§8 ${pid}`);
  }
  lines.push({
    rawtext: [
      { text: "§r§7" },
      { translate: `${rule.translates.bound_to_owner}` },
    ],
  });
  lines.push(`§r§9 ${attackingEntity.name}`);
  lines.push(`§r§8 ${attackingEntity.id}`);
  return lines;
}

function getDragonScepterBinding(itemStack) {
  const rawIds = itemStack.getDynamicProperty(
    "dragonmounts2:dragon_scepter_dragons",
  );
  const dragonIds =
    typeof rawIds === "string" && rawIds
      ? rawIds.split(",").filter(Boolean)
      : [];
  return {
    ownerName: itemStack.getDynamicProperty("dragonmounts2:owner_name"),
    ownerIdentifier: itemStack.getDynamicProperty(
      "dragonmounts2:owner_identifier",
    ),
    dragonName: itemStack.getDynamicProperty("dragonmounts2:dragon_name"),
    dragonIdentifier:
      dragonIds[0] ||
      itemStack.getDynamicProperty("dragonmounts2:dragon_identifier"),
    dragonIds,
  };
}

function getOwnedBoundScepterDragons(source, itemStack, rule) {
  if (!source?.isValid || !itemStack) return [];
  const binding = getDragonScepterBinding(itemStack);
  const boundPids = new Set((binding.dragonIds || []).filter(Boolean));
  if (!boundPids.size) return [];

  const dragons = source.dimension.getEntities({ families: ["dragonmounts2"] });
  return dragons.filter((dragon) => {
    if (!dragon?.isValid) return false;
    if (rule?.dragon_types && !rule.dragon_types.includes(dragon.typeId))
      return false;
    if (
      dragon.getDynamicProperty("dragonmounts2:owner_identifier") !== source.id
    )
      return false;
    const pid = getPersistentId(dragon);
    if (!pid || !boundPids.has(pid)) return false;
    const tameable = dragon.getComponent("minecraft:tameable");
    return tameable?.isTamed === true;
  });
}

                                             
                                                                               
                                                                              
                                                    
const FORMATION_NAMES_PROPERTY = "dragonmounts2:formation_names";
const FORMATION_NAMES_MAX = 12;

function readFormationNames(player) {
  try {
    const parsed = JSON.parse(player.getDynamicProperty(FORMATION_NAMES_PROPERTY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeFormationNames(player, names) {
  const keys = Object.keys(names);
  while (keys.length > FORMATION_NAMES_MAX) delete names[keys.shift()];
  const raw = JSON.stringify(names);
  if (player.getDynamicProperty(FORMATION_NAMES_PROPERTY) !== raw) {
    player.setDynamicProperty(FORMATION_NAMES_PROPERTY, raw);
  }
}

function buildScepterRoster(source, itemStack, rule) {
  const binding = getDragonScepterBinding(itemStack);
  const loaded = new Map();
  for (const dragon of getOwnedBoundScepterDragons(source, itemStack, rule)) {
    const pid = getPersistentId(dragon);
    if (pid) loaded.set(pid, dragon);
  }
  const names = readFormationNames(source);
  let namesChanged = false;
  const order = dragonUtilities.getFormationOrder(source);
  const entries = [...new Set(binding.dragonIds)].map((pid) => {
    const dragon = loaded.get(pid) ?? null;
    if (dragon) {
      const label = (dragon.nameTag || "").trim();
      if ((names[pid] ?? "") !== label) {
        if (label) names[pid] = label;
        else delete names[pid];
        namesChanged = true;
      }
    }
    const index = order.indexOf(pid);
    return {
      pid,
      dragon,
      name: dragon ? dragon.nameTag : names[pid],
      rank: index >= 0 ? index + 1 : 0,
    };
  });
  if (namesChanged) writeFormationNames(source, names);
  entries.sort((a, b) => {
    if ((a.rank > 0) !== (b.rank > 0)) return a.rank > 0 ? -1 : 1;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return compareByAge(a.pid, b.pid);
  });
  return entries;
}

function rosterEntryText(entry) {
  return {
    rawtext: [
      nameText(entry.name),
      ...(entry.dragon
        ? []
        : [{ text: " " }, { translate: "tooltip.dragonmounts2:flight_rank.not_nearby" }]),
    ],
  };
}

                                                                           
function announceFormation(source, roster) {
  source.onScreenDisplay.setActionBar({
    rawtext: [{ text: "§a" }, ...formationSummaryText(roster)],
  });
  source.dimension.playSound("random.click", source.location, getSoundOptions());
}

function formationSummaryText(roster) {
  const parts = [{ translate: "tooltip.dragonmounts2:flight_rank.order_prefix" }, { text: " " }];
  const flying = roster.slice(0, 4);
  if (!flying.length) parts.push({ translate: "tooltip.dragonmounts2:flight_rank.auto" });
  flying.forEach((entry, index) => {
    if (index > 0) parts.push({ text: ", " });
    parts.push({
      translate: entry.rank > 0
        ? "tooltip.dragonmounts2:flight_rank.order_entry"
        : "tooltip.dragonmounts2:flight_rank.order_entry_auto",
      with: { rawtext: [{ text: String(index + 1) }, nameText(entry.name)] },
    });
  });
  return parts;
}

function showFormationRankPicker(source, itemStack, rule, pid) {
  const roster = buildScepterRoster(source, itemStack, rule);
  const target = roster.find((entry) => entry.pid === pid);
  if (!target) return showDragonScepterUI(source, itemStack, rule);
  const order = dragonUtilities.getFormationOrder(source);
  const cap = Math.min(4, order.length + (order.includes(pid) ? 0 : 1));
  const form = new CustomForm(source, { translate: `${rule.translates.name}` }).label({
    rawtext: [
      { translate: "tooltip.dragonmounts2:flight_rank.pick_rank" },
      { text: " " },
      rosterEntryText(target),
    ],
  });
  const apply = (rank) => system.run(() => {
    if (!source?.isValid) return;
    dragonUtilities.setFormationRank(source, pid, rank);
    announceFormation(source, buildScepterRoster(source, itemStack, rule));
    showDragonScepterUI(source, itemStack, rule);
  });
  for (let rank = 1; rank <= cap; rank += 1) {
    const holderPid = order[rank - 1];
    const holder = holderPid ? roster.find((entry) => entry.pid === holderPid) : null;
    let label;
    if (holderPid === pid) {
      label = { translate: "tooltip.dragonmounts2:flight_rank.rank_option_current", with: [String(rank)] };
    } else if (holder) {
      label = {
        translate: "tooltip.dragonmounts2:flight_rank.rank_option_occupied",
        with: { rawtext: [{ text: String(rank) }, nameText(holder.name)] },
      };
    } else {
      label = { translate: "tooltip.dragonmounts2:flight_rank.value", with: [String(rank)] };
    }
    form.button(label, "textures/ui/dragonmounts2/dragon_flute/v_formation", () => apply(rank));
  }
  form.button({ translate: "tooltip.dragonmounts2:flight_rank.auto" }, "textures/ui/dragonmounts2/dragon_flute/v_formation", () => apply(0));
  form.button({ translate: "tooltip.dragonmounts2:flight_rank.back" }, () =>
    system.run(() => showFormationDragonPicker(source, itemStack, rule)));
  form.show().catch((e) => console.error(e));
}

function showFormationDragonPicker(source, itemStack, rule) {
  const roster = buildScepterRoster(source, itemStack, rule);
  const form = new CustomForm(source, { translate: `${rule.translates.name}` }).label({
    rawtext: [{ translate: "tooltip.dragonmounts2:flight_rank.pick_dragon" }],
  });
  for (const entry of roster) {
    form.button(
      { rawtext: [rosterEntryText(entry), { text: "\n" }, flightRankText(entry.rank)] },
      "textures/ui/dragonmounts2/dragon_flute/v_formation",
      () => system.run(() => {
        if (source?.isValid) showFormationRankPicker(source, itemStack, rule, entry.pid);
      }),
    );
  }
  form.button({ translate: "tooltip.dragonmounts2:flight_rank.back" }, () =>
    system.run(() => showDragonScepterUI(source, itemStack, rule)));
  form.show().catch((e) => console.error(e));
}

function showDragonScepterUI(source, itemStack, rule) {
  if (!getRidingDragon(source, rule)) {
    return source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        { translate: `${rule.translates.must_be_riding}` },
      ],
    });
  }

  const roster = buildScepterRoster(source, itemStack, rule);
  if (!roster.length)
    return source.onScreenDisplay.setActionBar({
      rawtext: [{ text: "§c" }, { translate: `${rule.translates.not_bound}` }],
    });

  const flightEnabled = dragonUtilities.isFormationFlightEnabled(source);
  // Keep the active V roster in sync with the scepter being used.
  if (flightEnabled) {
    dragonUtilities.setFormationRoster(source, getDragonScepterBinding(itemStack).dragonIds);
  }
  const scepterForm = new CustomForm(source, {
    translate: `${rule.translates.name}`,
  }).label({ rawtext: formationSummaryText(roster) });
  scepterForm.button(
    { translate: flightEnabled ? "tooltip.dragonmounts2:flight_rank.vflight_state_on" : "tooltip.dragonmounts2:flight_rank.vflight_state_off" },
    "textures/ui/dragonmounts2/dragon_flute/v_formation",
    () => system.run(() => {
      if (!source?.isValid) return;
      toggleFormationFlight(source, itemStack);
      showDragonScepterUI(source, itemStack, rule);
    }),
  );
  scepterForm.button(
    { translate: "tooltip.dragonmounts2:flight_rank.set_formation" },
    "textures/ui/dragonmounts2/dragon_flute/v_formation",
    () => system.run(() => {
      if (source?.isValid) showFormationDragonPicker(source, itemStack, rule);
    }),
  );
  scepterForm.show().catch((e) => {
    console.error(e);
  });
}

export function itemToolDamage(itemStack, player) {
  if (!player?.isValid || player.getGameMode() === GameMode.creative) return;

  const mainhand = getMainhandSlot(player);
  if (!mainhand) return;
  const durability = itemStack.getComponent(
    ItemDurabilityComponent.componentId,
  );
  if (!durability) return;

  const unbreaking =
    itemStack
      .getComponent(ItemEnchantableComponent.componentId)
      ?.getEnchantment("unbreaking")?.level || 0;
  const damageChance = 1 / (unbreaking + 1);

  if (Math.random() > damageChance) return;

  if (durability.damage >= durability.maxDurability) {
    mainhand.setItem(undefined);
    player.playSound("random.break", getSoundOptions());
  } else {
    durability.damage++;
    mainhand.setItem(itemStack);
  }
}

export function dragonFluteHitEntity(
  attackingEntity,
  hitEntity,
  itemStack,
  params,
) {
  if (!(attackingEntity instanceof Player) || !hitEntity?.isValid) return;

  const rule = params;
  if (!rule.dragon_types?.includes(hitEntity.typeId)) {
    return attackingEntity.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        { translate: `${rule.translates.selected_mobs}` },
      ],
    });
  }

  if (!hitEntity.hasComponent("minecraft:is_tamed")) {
    return attackingEntity.onScreenDisplay.setActionBar({
      rawtext: [{ text: "§c" }, { translate: `${rule.translates.untamed}` }],
    });
  }

  const ownerIdentifier = hitEntity.getDynamicProperty(
    "dragonmounts2:owner_identifier",
  );
  if (ownerIdentifier && ownerIdentifier !== attackingEntity.id) {
    return attackingEntity.onScreenDisplay.setActionBar({
      rawtext: [{ text: "§c" }, { translate: `${rule.translates.not_owned}` }],
    });
  }

  if (!ownerIdentifier) {
    hitEntity.setDynamicProperty(
      "dragonmounts2:owner_identifier",
      attackingEntity.id,
    );
  }

  system.run(() => {
    if (!hitEntity.isValid) return;

    const pid = getPersistentId(hitEntity);
    if (!pid) return;

    const binding = getDragonFluteBinding(itemStack);
    const dragonFluteOwnerIdentifier = hitEntity.getDynamicProperty(
      "dragonmounts2:dragon_flute_owner_identifier",
    );
    const dragonFluteType = hitEntity.getDynamicProperty(
      "dragonmounts2:dragon_flute_type",
    );

    if (
      dragonFluteOwnerIdentifier &&
      dragonFluteOwnerIdentifier !== attackingEntity.id
    ) {
      return attackingEntity.onScreenDisplay.setActionBar({
        rawtext: [
          { text: "§c" },
          { translate: `${rule.translates.bounded_other_owner}` },
        ],
      });
    }

    if (dragonFluteType && dragonFluteType !== itemStack.typeId) {
      return attackingEntity.onScreenDisplay.setActionBar({
        rawtext: [
          { text: "§c" },
          { translate: `${rule.translates.bounded_other_flute}` },
        ],
      });
    }

    if (
      binding?.ownerIdentifier === attackingEntity.id &&
      binding.dragonIdentifier === pid
    ) {
      unbindDragonFlute(attackingEntity, hitEntity, itemStack, rule);
      attackingEntity.onScreenDisplay.setActionBar({
        rawtext: [{ text: "§e" }, { translate: `${rule.translates.unbound}` }],
      });
      attackingEntity.dimension.playSound(
        "random.break",
        attackingEntity.location,
        getSoundOptions(),
      );
    } else {
      bindDragonFlute(attackingEntity, hitEntity, itemStack, rule, pid);
      attackingEntity.onScreenDisplay.setActionBar({
        rawtext: [{ text: "§e" }, { translate: `${rule.translates.bound}` }],
      });
      attackingEntity.dimension.playSound(
        "random.levelup",
        attackingEntity.location,
        getSoundOptions(),
      );
    }
  });
}

function bindDragonFlute(attackingEntity, hitEntity, itemStack, rule, pid) {
  if (!attackingEntity?.isValid || !hitEntity?.isValid) return;

  const equippable = attackingEntity.getComponent(
    EntityEquippableComponent.componentId,
  );
  if (!equippable) return;

  const mainhand = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
  const dyeable = itemStack.getComponent("minecraft:dyeable");
  if (!dyeable) return;

  const itemName = itemStack.nameTag;
  const dragonFluteItem = new ItemStack(itemStack.typeId);
  const dragonName = getEntityName(hitEntity);

  dragonFluteItem.setLore([
    {
      rawtext: [{ text: "§r§7" }, { translate: `${rule.translates.bound_to}` }],
    },
    `§r§9 ${dragonName}`,
    `§r§8 ${pid}`,
    {
      rawtext: [
        { text: "§r§7" },
        { translate: `${rule.translates.bound_to_owner}` },
      ],
    },
    `§r§9 ${attackingEntity.name}`,
    `§r§8 ${attackingEntity.id}`,
  ]);

  dragonFluteItem.setDynamicProperty(
    "dragonmounts2:owner_name",
    attackingEntity.name,
  );
  dragonFluteItem.setDynamicProperty(
    "dragonmounts2:owner_identifier",
    attackingEntity.id,
  );
  dragonFluteItem.setDynamicProperty("dragonmounts2:dragon_name", dragonName);
  dragonFluteItem.setDynamicProperty("dragonmounts2:dragon_identifier", pid);

  hitEntity.setDynamicProperty(
    "dragonmounts2:dragon_flute_owner_identifier",
    attackingEntity.id,
  );
  hitEntity.setDynamicProperty(
    "dragonmounts2:dragon_flute_type",
    itemStack.typeId,
  );

  const continueDyeable = dragonFluteItem.getComponent("minecraft:dyeable");
  if (continueDyeable) {
    continueDyeable.color = dyeable.color;
  }

  dragonFluteItem.nameTag = itemName;
  mainhand.setItem(dragonFluteItem);
}

function unbindDragonFlute(attackingEntity, hitEntity, itemStack) {
  if (!attackingEntity?.isValid) return;

  const equippable = attackingEntity.getComponent(
    EntityEquippableComponent.componentId,
  );
  if (!equippable) return;

  const mainhand = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
  const dyeable = itemStack.getComponent("minecraft:dyeable");
  if (!dyeable) return;

  const dragonFluteItem = new ItemStack(itemStack.typeId);
  const continueDyeable = dragonFluteItem.getComponent("minecraft:dyeable");
  if (continueDyeable) {
    continueDyeable.color = dyeable.color;
  }

  mainhand.setItem(dragonFluteItem);
  hitEntity.setDynamicProperty(
    "dragonmounts2:dragon_flute_owner_identifier",
    "",
  );
  hitEntity.setDynamicProperty("dragonmounts2:dragon_flute_type", "");
}

function getDragonFluteBinding(itemStack) {
  return {
    ownerName: itemStack.getDynamicProperty("dragonmounts2:owner_name"),
    ownerIdentifier: itemStack.getDynamicProperty(
      "dragonmounts2:owner_identifier",
    ),
    dragonName: itemStack.getDynamicProperty("dragonmounts2:dragon_name"),
    dragonIdentifier: itemStack.getDynamicProperty(
      "dragonmounts2:dragon_identifier",
    ),
  };
}

function findDragonByPersistentId(dimension, pid) {
  if (!pid) return null;
  const entities = dimension.getEntities({ families: ["dragonmounts2"] });
  for (const entity of entities) {
    if (getPersistentId(entity) === pid) return entity;
  }
  return null;
}

function dragonHitboxFits(dim, fx, fy, fz) {
  if (!dim) return false;
  try {
    for (let offset = 0; offset < 3; offset++) {
      const block = dim.getBlock({
        x: Math.floor(fx),
        y: Math.floor(fy) + offset,
        z: Math.floor(fz),
      });
      if (!block || !TELEPORT_AIR_TYPES.has(block.typeId)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function setDragonHome(dragon, owner) {
  if (!dragon?.isValid || !owner?.isValid) return false;
  const location = owner.location;
  dragon.setDynamicProperty("dragonmounts2:home_x", location.x);
  dragon.setDynamicProperty("dragonmounts2:home_y", location.y);
  dragon.setDynamicProperty("dragonmounts2:home_z", location.z);
  dragon.setDynamicProperty("dragonmounts2:home_dimension", owner.dimension.id);
  return true;
}

function getDragonHome(dragon) {
  if (!dragon?.isValid) return null;
  const x = dragon.getDynamicProperty("dragonmounts2:home_x");
  const y = dragon.getDynamicProperty("dragonmounts2:home_y");
  const z = dragon.getDynamicProperty("dragonmounts2:home_z");
  const dimensionId = dragon.getDynamicProperty("dragonmounts2:home_dimension");
  if (
    ![x, y, z].every((value) => typeof value === "number") ||
    typeof dimensionId !== "string"
  )
    return null;
  return { location: { x, y, z }, dimensionId };
}

function isDragonAtHome(dragon, home) {
  if (!home?.location || home.dimensionId !== dragon?.dimension?.id)
    return false;
  return distanceBetween(dragon.location, home.location) <= 2;
}

function hasSolidTeleportGround(dim, x, y, z) {
  const ground = dim.getBlock({
    x: Math.floor(x),
    y: Math.floor(y) - 1,
    z: Math.floor(z),
  });
  if (!ground || ground.typeId === "minecraft:air") return false;
  if (ground.typeId.includes("water") || ground.typeId.includes("lava"))
    return false;
  try {
    return (
      ground.permutation?.getState("minecraft:waterlogged") !== true &&
      ground.permutation?.getState("waterlogged") !== true
    );
  } catch {
    return false;
  }
}

function isPlayerStandingOnSolidBlock(player) {
  if (!player?.isValid) return false;
  const location = player.location;
  return hasSolidTeleportGround(
    player.dimension,
    location.x,
    location.y,
    location.z,
  );
}

function findFreeTeleportSpot(source, searchOrigin = source.location) {
  const dim = source.dimension;
  const origin = searchOrigin;
  const radius = 10;

  for (let attempt = 0; attempt < 20; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 2 + Math.random() * (radius - 2);
    const tx = Math.floor(origin.x + Math.cos(angle) * dist) + 0.5;
    const tz = Math.floor(origin.z + Math.sin(angle) * dist) + 0.5;

    for (let dy = 2; dy >= -4; dy--) {
      const ty = Math.floor(origin.y) + dy;
      if (
        hasSolidTeleportGround(dim, tx, ty, tz) &&
        dragonHitboxFits(dim, tx, ty, tz)
      ) {
        return { x: tx, y: ty, z: tz };
      }
    }
  }

  return null;
}

function showDragonFluteUI(source, itemStack, rule) {
  const binding = getDragonFluteBinding(itemStack);
  if (!binding?.dragonIdentifier)
    return source.onScreenDisplay.setActionBar({
      rawtext: [{ text: "§c" }, { translate: `${rule.translates.not_bound}` }],
    });

  const dragon = findDragonByPersistentId(
    source.dimension,
    binding.dragonIdentifier,
  );
  if (!dragon)
    return source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        { translate: `${rule.translates.not_located}` },
      ],
    });
  if (
    dragon.getDynamicProperty("dragonmounts2:owner_identifier") != source.id
  ) {
    return source.onScreenDisplay.setActionBar({
      rawtext: [{ text: "§c" }, { translate: `${rule.translates.not_owned}` }],
    });
  }

  const dragonIsFollowing = dragon.getProperty("dragonmounts2:is_following");
  const dragonIsLocked = dragon.getProperty("dragonmounts2:is_locked");
  const dragonMobState = dragon.getProperty("dragonmounts2:mob_state");
  const dragonHome = getDragonHome(dragon);
  const dragonAtHome = dragonHome && isDragonAtHome(dragon, dragonHome);
  const homeButtonTranslation =
    dragonHome && !dragonAtHome
      ? rule.translates.send_home
      : rule.translates.set_home;
  const homeButtonIcon =
    dragonHome && !dragonAtHome
      ? "textures/ui/dragonmounts2/dragon_flute/send_home"
      : "textures/ui/dragonmounts2/dragon_flute/set_home";
  const dragonName = nameText(dragon.nameTag);

  const fluteForm = new CustomForm(source, {
    translate: `${rule.translates.name}`,
  })
    .label({
      rawtext: [
        { translate: `${rule.translates.bound_to}` },
        dragonName,
        { text: "\n\n" },
        { translate: `${rule.translates.select_command}` },
      ],
    })
    .button(
      { translate: `${rule.translates.come_to_owner}` },
      "textures/ui/dragonmounts2/dragon_flute/come_to_owner",
      () => {
        try {
          fluteForm.close();
        } catch {}
        system.run(() => {
          if (!source?.isValid || !dragon?.isValid) return;
          const blockRay = source.getBlockFromViewDirection({
            maxDistance: 10,
            includePassableBlocks: false,
            includeLiquidBlocks: false,
          });
          let teleportPos;
          if (blockRay?.block) {
            const b = blockRay.block.location;
            teleportPos = findFreeTeleportSpot(source, {
              x: b.x + 0.5,
              y: b.y + 1,
              z: b.z + 0.5,
            });
            const candidate = { x: b.x + 0.5, y: b.y + 1, z: b.z + 0.5 };
            if (
              !teleportPos &&
              hasSolidTeleportGround(
                source.dimension,
                candidate.x,
                candidate.y,
                candidate.z,
              ) &&
              dragonHitboxFits(
                source.dimension,
                candidate.x,
                candidate.y,
                candidate.z,
              )
            ) {
              teleportPos = candidate;
            }
          } else {
            teleportPos = findFreeTeleportSpot(source);
          }
          if (!teleportPos) return;
          dragon.teleport(teleportPos, { dimension: source.dimension });
          dragonUtilities.normalizeDragonAfterTeleport(dragon);
          source.onScreenDisplay.setActionBar({
            rawtext: [{ text: "§a" }, { translate: `${rule.translates.came}` }],
          });
          source.dimension.playSound(
            rule.sounds.long,
            source.location,
            getSoundOptions(),
          );
        });
      },
    )
    .button(
      {
        translate: `${homeButtonTranslation}`,
      },
      homeButtonIcon,
      () => {
        try {
          fluteForm.close();
        } catch {}
        system.run(() => {
          if (!source?.isValid || !dragon?.isValid) return;
          const home = getDragonHome(dragon);
          if (!home || isDragonAtHome(dragon, home)) {
            if (!isPlayerStandingOnSolidBlock(source)) {
              source.onScreenDisplay.setActionBar({
                rawtext: [
                  { text: "§c" },
                  { translate: `${rule.translates.home_ground}` },
                ],
              });
              return;
            }
            if (!setDragonHome(dragon, source)) return;
            source.onScreenDisplay.setActionBar({
              rawtext: [
                { text: "§a" },
                { translate: `${rule.translates.home_set}` },
              ],
            });
            source.dimension.playSound(
              rule.sounds.short,
              source.location,
              getSoundOptions(),
            );
            return;
          }
          try {
            dragon.teleport(home.location, {
              dimension: world.getDimension(home.dimensionId),
            });
            dragonUtilities.normalizeDragonAfterTeleport(dragon);
            source.onScreenDisplay.setActionBar({
              rawtext: [
                { text: "§a" },
                { translate: `${rule.translates.sent_home}` },
              ],
            });
            source.dimension.playSound(
              rule.sounds.long,
              source.location,
              getSoundOptions(),
            );
          } catch {}
        });
      },
    )
    .button(
      dragonMobState == "standing"
        ? { translate: `${rule.translates.sit}` }
        : { translate: `${rule.translates.stand}` },
      dragonMobState == "standing"
        ? "textures/ui/dragonmounts2/dragon_flute/sit"
        : "textures/ui/dragonmounts2/dragon_flute/stand",
      () => {
        try {
          fluteForm.close();
        } catch {}
        system.run(() => {
          if (dragonMobState == "standing") {
            source.onScreenDisplay.setActionBar({
              rawtext: [
                { text: "§a" },
                { translate: `${rule.translates.sitting}` },
              ],
            });
            dragon.triggerEvent("minecraft:on_sit");
          } else {
            source.onScreenDisplay.setActionBar({
              rawtext: [
                { text: "§a" },
                { translate: `${rule.translates.standing}` },
              ],
            });
            dragon.triggerEvent("minecraft:on_stand");
          }
          source.dimension.playSound(
            rule.sounds.short,
            source.location,
            getSoundOptions(),
          );
        });
      },
    )
    .button(
      dragonIsFollowing == false
        ? { translate: `${rule.translates.follow}` }
        : { translate: `${rule.translates.wander}` },
      dragonIsFollowing == false
        ? "textures/ui/dragonmounts2/dragon_flute/follow"
        : "textures/ui/dragonmounts2/dragon_flute/wander",
      () => {
        try {
          fluteForm.close();
        } catch {}
        system.run(() => {
          if (dragonIsFollowing == false) {
            if (dragonMobState == "sitting")
              return source.onScreenDisplay.setActionBar({
                rawtext: [
                  { text: "§c" },
                  { translate: `${rule.translates.follow_deny}` },
                ],
              });
            source.onScreenDisplay.setActionBar({
              rawtext: [
                { text: "§a" },
                { translate: `${rule.translates.following}` },
              ],
            });
            dragon.triggerEvent("minecraft:on_follow");
          } else {
            source.onScreenDisplay.setActionBar({
              rawtext: [
                { text: "§a" },
                { translate: `${rule.translates.wandering}` },
              ],
            });
            dragon.triggerEvent("minecraft:on_wander");
          }
          source.dimension.playSound(
            rule.sounds.short,
            source.location,
            getSoundOptions(),
          );
        });
      },
    )
    .button(
      dragonIsLocked == false
        ? { translate: `${rule.translates.lock}` }
        : { translate: `${rule.translates.unlock}` },
      dragonIsLocked == false
        ? "textures/ui/dragonmounts2/dragon_flute/lock"
        : "textures/ui/dragonmounts2/dragon_flute/unlock",
      () => {
        try {
          fluteForm.close();
        } catch {}
        system.run(() => {
          if (dragonIsLocked == false) {
            source.onScreenDisplay.setActionBar({
              rawtext: [
                { text: "§a" },
                { translate: `${rule.translates.locked}` },
              ],
            });
            dragon.triggerEvent("minecraft:on_lock");
          } else {
            source.onScreenDisplay.setActionBar({
              rawtext: [
                { text: "§a" },
                { translate: `${rule.translates.unlocked}` },
              ],
            });
            dragon.triggerEvent("minecraft:on_unlock");
          }
          source.dimension.playSound(
            rule.sounds.long,
            source.location,
            getSoundOptions(),
          );
        });
      },
    );
  fluteForm.show().catch((e) => {
    console.error(e);
  });
}

function getAmuletData(itemStack) {
  return {
    dragonIdentifier: itemStack.getDynamicProperty(
      "dragonmounts2:dragon_identifier",
    ),
    dragonType: itemStack.getDynamicProperty("dragonmounts2:dragon_type"),
    dragonName: itemStack.getDynamicProperty("dragonmounts2:dragon_name"),
    dragonHealth: itemStack.getDynamicProperty("dragonmounts2:dragon_health"),
    ownerIdentifier: itemStack.getDynamicProperty(
      "dragonmounts2:owner_identifier",
    ),
    ownerName: itemStack.getDynamicProperty("dragonmounts2:owner_name"),
  };
}

function isAmuletFilled(itemStack) {
  return !!itemStack.getDynamicProperty("dragonmounts2:dragon_identifier");
}

function copyDyeableColor(sourceItem, targetItem) {
  const sourceDyeable = sourceItem.getComponent("minecraft:dyeable");
  const targetDyeable = targetItem.getComponent("minecraft:dyeable");
  if (sourceDyeable && targetDyeable) {
    targetDyeable.color = sourceDyeable.color;
  }
}

export function dragonAmuletHitEntity(
  attackingEntity,
  hitEntity,
  itemStack,
  params,
) {
  if (!(attackingEntity instanceof Player) || !hitEntity?.isValid) return;

  const rule = params;
  if (!rule.dragon_types?.includes(hitEntity.typeId)) {
    return attackingEntity.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        { translate: `${rule.translates.selected_mobs}` },
      ],
    });
  }

  if (isAmuletFilled(itemStack)) return;

  const tameable = hitEntity.getComponent("minecraft:tameable");
  if (!tameable || !tameable.isTamed) {
    return attackingEntity.onScreenDisplay.setActionBar({
      rawtext: [{ text: "§c" }, { translate: `${rule.translates.untamed}` }],
    });
  }

  if (tameable.tamedToPlayerId !== attackingEntity.id) {
    return attackingEntity.onScreenDisplay.setActionBar({
      rawtext: [{ text: "§c" }, { translate: `${rule.translates.not_owned}` }],
    });
  }

  const healthComp = hitEntity.getComponent("minecraft:health");
  if (!healthComp) return;

  const { x, y, z } = hitEntity.location;
  const saveX = Math.floor(x);
  const saveY = Math.floor(y) + 320;
  const saveZ = Math.floor(z);

  const pid = getPersistentId(hitEntity);
  if (!pid) return;

  let dragonName = hitEntity.nameTag;
  if (!dragonName || dragonName.trim() === "") dragonName = "Unnamed";

  const health = Math.round(healthComp.currentValue);

  const amuletType =
    itemData.dragonAmuletTypes[hitEntity.typeId] ||
    "dragonmounts2:dragon_amulet";
  const filledAmulet = new ItemStack(amuletType, 1);
  copyDyeableColor(itemStack, filledAmulet);

  const variantProperty =
    hitEntity.getProperty("dragonmounts2:variant_type") || "default";
  const amuletData = itemData.dragonAmuletDataBlockTypes[hitEntity.typeId];
  const textTranslateType = amuletData
    ? amuletData.dragon_data.text_translate_type
    : null;
  const textColorType = amuletData
    ? amuletData.dragon_data.text_color_type
    : "§r";

  filledAmulet.setDynamicProperty("dragonmounts2:dragon_identifier", pid);
  filledAmulet.setDynamicProperty(
    "dragonmounts2:dragon_type",
    hitEntity.typeId,
  );
  filledAmulet.setDynamicProperty("dragonmounts2:dragon_name", dragonName);
  filledAmulet.setDynamicProperty("dragonmounts2:dragon_health", health);
  filledAmulet.setDynamicProperty(
    "dragonmounts2:owner_identifier",
    attackingEntity.id,
  );
  filledAmulet.setDynamicProperty(
    "dragonmounts2:owner_name",
    attackingEntity.name,
  );
  filledAmulet.setDynamicProperty(
    "dragonmounts2:variant_type",
    variantProperty,
  );

  const loreLines = [];
  if (textTranslateType) {
    loreLines.push({
      rawtext: [
        { text: `${textColorType}` },
        { translate: `${textTranslateType}` },
      ],
    });
  }
  loreLines.push(
    {
      rawtext: [
        { text: "§r§7" },
        { translate: `${rule.translates.captured_to}` },
      ],
    },
    `§r§9 ${dragonName}`,
    `§r§8 ${pid}`,
    { rawtext: [{ text: "§r§7" }, { translate: `${rule.translates.health}` }] },
    `§r§a ${health}`,
    {
      rawtext: [
        { text: "§r§7" },
        { translate: "tooltip.dragonmounts2:dragon_variant_type" },
        { text: ":" },
      ],
    },
    `§r§9 ${variantProperty}`,
    {
      rawtext: [
        { text: "§r§7" },
        { translate: `${rule.translates.captured_to_owner}` },
      ],
    },
    `§r§9 ${attackingEntity.name}`,
    `§r§8 ${attackingEntity.id}`,
  );
  filledAmulet.setLore(loreLines);

  system.run(() => {
    if (!hitEntity.isValid) return;

    // Only dismount players that are actually riding THIS dragon (the old
    // `@a[r=3.1]` selector also kicked bystanders off horses, boats, etc.).
    dismountRiders(hitEntity);
    const originalLocation = { x, y, z };
    try {
      runCaptureCommand(hitEntity, `tp ${saveX} ${saveY} ${saveZ}`);
      runCaptureCommand(
        hitEntity,
        `structure save "${pid}" ${saveX} ${saveY} ${saveZ} ${saveX} ${saveY} ${saveZ} true disk false`,
      );
    } catch (error) {
      // Never strand or lose the dragon if the save fails: put it back.
      try {
        if (hitEntity.isValid) hitEntity.teleport(originalLocation);
      } catch {}
      console.warn(
        `[DragonMounts2] Amulet capture aborted: ${error?.message ?? error}`,
      );
      return;
    }
    hitEntity.remove();

    const equippable = attackingEntity.getComponent("minecraft:equippable");
    if (!equippable) return;

    const mainhand = equippable.getEquipmentSlot("Mainhand");
    mainhand.setItem(filledAmulet);

    if (rule.sounds?.capture) {
      attackingEntity.dimension.playSound(
        rule.sounds.capture,
        attackingEntity.location,
        getSoundOptions(),
      );
    }

    attackingEntity.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§a" },
        { translate: `${rule.translates.captured}` },
        { text: " " },
        nameText(dragonName),
      ],
    });
  });
}

export function dragonAmuletUseOn(source, block, blockFace, itemStack, params) {
  if (!(source instanceof Player)) return;
  if (!isAmuletFilled(itemStack)) return;

  const rule = params;
  const data = getAmuletData(itemStack);

  if (data.ownerIdentifier && data.ownerIdentifier !== source.id) {
    return source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        { translate: `${rule.translates.owned_by}` },
        { text: ` ${data.ownerName}` },
      ],
    });
  }

  const pos = block.location;
  const releaseY = pos.y + 1;
  const directions = {
    North: { x: pos.x + 0.5, y: releaseY, z: pos.z - 0.5 },
    South: { x: pos.x + 0.5, y: releaseY, z: pos.z + 1.5 },
    East: { x: pos.x + 1.5, y: releaseY, z: pos.z + 0.5 },
    West: { x: pos.x - 0.5, y: releaseY, z: pos.z + 0.5 },
    Up: { x: pos.x + 0.5, y: releaseY, z: pos.z + 0.5 },
    Down: { x: pos.x + 0.5, y: releaseY, z: pos.z + 0.5 },
  };

  const { x, y, z } = directions[blockFace] ?? directions["Up"];
  const releaseLocation = { x, y, z };

  system.run(() => {
    if (rule.sounds?.release) {
      source.dimension.playSound(
        rule.sounds.release,
        releaseLocation,
        getSoundOptions(),
      );
    }

    source.runCommand(
      `structure load "${data.dragonIdentifier}" ${x} ${y} ${z}`,
    );
    source.runCommand(`structure delete "${data.dragonIdentifier}"`);

    const emptyAmulet = new ItemStack("dragonmounts2:dragon_amulet", 1);
    copyDyeableColor(itemStack, emptyAmulet);
    const equippable = source.getComponent("minecraft:equippable");
    if (!equippable) return;

    const mainhand = equippable.getEquipmentSlot("Mainhand");
    mainhand.setItem(emptyAmulet);

    source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§a" },
        { translate: `${rule.translates.released}` },
        { text: " " },
        nameText(data.dragonName),
      ],
    });
  });
}
