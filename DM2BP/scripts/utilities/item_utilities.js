import {
  world,
  system,
  ItemStack,
  Player,
  EquipmentSlot,
  EntityEquippableComponent,
  ItemDurabilityComponent,
  ItemEnchantableComponent,
  ItemCooldownComponent,
  GameMode,
} from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import * as entityArrays from "../arrays/entity_arrays.js";
import * as entityData from "../data/entity_data.js";
import * as itemData from "../data/item_data.js";
import { distanceBetween, getPersistentId } from "./entity_utilities.js";
import * as dragonUtilities from "./dragon_utilities.js";
import { getSoundOptions } from "../data/settings.js";

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

  button(text, callback) {
    this.form.button(text);
    this.callbacks.push(callback);
    return this;
  }

  close() { }

  show() {
    return this.form.show(this.player).then((response) => {
      if (response.canceled || response.selection === undefined) return response;
      this.callbacks[response.selection]?.();
      return response;
    });
  }
}

const TELEPORT_AIR_TYPES = new Set(entityArrays.teleportAirTypes);

function getMainhandSlot(player) {
  return player
    ?.getComponent(EntityEquippableComponent.componentId)
    ?.getEquipmentSlot(EquipmentSlot.Mainhand);
}

function getEntityName(entity) {
  return entity?.nameTag?.trim() || "Unnamed";
}

export function restoreGuideBookMode(player) {
  if (!(player instanceof Player) || !player.isValid) return;

  const originalMode = player.getDynamicProperty(
    "dragonmounts2:guide_book_original_mode",
  );
  if (
    originalMode === "creative" &&
    player.getGameMode() === GameMode.spectator
  ) {
    player.setGameMode(GameMode.creative);
  }
  player.setDynamicProperty(
    "dragonmounts2:guide_book_original_mode",
    undefined,
  );
  player.setDynamicProperty("dragonmounts2:guide_book_open", false);
}

export function guideBookUse(itemStack, source) {
  if (!(source instanceof Player) || !source.isValid) return;

  const existingBookId = source.getDynamicProperty(
    "dragonmounts2:guide_book_entity_id",
  );
  if (
    existingBookId &&
    source.getDynamicProperty("dragonmounts2:guide_book_open") === true
  )
    return;

  if (source.getGameMode() === GameMode.creative) {
    source.setDynamicProperty(
      "dragonmounts2:guide_book_original_mode",
      "creative",
    );
  }
  const bookEntity = source.dimension.spawnEntity(
    "dragonmounts2:guide_book",
    source.location,
  );
  if (!bookEntity?.isValid) return;

  bookEntity.setDynamicProperty("dragonmounts2:book_user_id", source.id);
  source.setDynamicProperty(
    "dragonmounts2:guide_book_entity_id",
    bookEntity.id,
  );

  system.runTimeout(() => {
    if (!bookEntity?.isValid || !source?.isValid) return;
    if (source.getGameMode() === GameMode.creative) {
      source.setGameMode(GameMode.spectator);
    }
    source.runCommand(
      `/dialogue open @e[type=dragonmounts2:guide_book,c=1] @s dragonmounts2:1-home`,
    );
  }, 2);
}

export function dragonFluteUse(itemStack, source, params) {
  if (!(source instanceof Player)) return;

  const rule = params;

  if (source.isSneaking) {
    return toggleNearbyVFlight(source, rule);
  }

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

function toggleNearbyVFlight(source, rule) {
  const maxDistance = rule.v_flight_max_distance ?? rule.max_distance ?? 12;

  const results = source.getEntitiesFromViewDirection({
    maxDistance,
    ignoreBlockCollision: false,
    includePassableBlocks: false,
    families: ["dragonmounts2"],
  });

  const dragon = results?.[0]?.entity;
  if (!dragon?.isValid) {
    return source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        { translate: `${rule.translates.vflight_no_target}` },
      ],
    });
  }

  if (rule.dragon_types && !rule.dragon_types.includes(dragon.typeId)) {
    return source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        { translate: `${rule.translates.selected_mobs}` },
      ],
    });
  }

  const tameable = dragon.getComponent("minecraft:tameable");
  if (!tameable?.isTamed) {
    return source.onScreenDisplay.setActionBar({
      rawtext: [{ text: "§c" }, { translate: `${rule.translates.untamed}` }],
    });
  }

  const ownerIdentifier = dragon.getDynamicProperty(
    "dragonmounts2:owner_identifier",
  );
  if (ownerIdentifier !== source.id) {
    return source.onScreenDisplay.setActionBar({
      rawtext: [{ text: "§c" }, { translate: `${rule.translates.not_owned}` }],
    });
  }

  const dragonName = getEntityName(dragon);

  const currentlyEnabled =
    dragon.getProperty("dragonmounts2:v_flight_enabled") === true;

  if (currentlyEnabled) {
    dragonUtilities.disableVFlight(dragon, "manual");
    source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§e" },
        { translate: `${rule.translates.vflight_disabled}` },
        { text: ` ${dragonName}` },
      ],
    });
    source.dimension.playSound(
      "random.break",
      source.location,
      getSoundOptions(),
    );
    return;
  }

  const controllerDragon =
    source.getComponent("minecraft:riding")?.entityRidingOn;
  const started = dragonUtilities.startVFlight(
    dragon,
    source.id,
    source.dimension,
    controllerDragon,
  );
  if (!started) {
    return source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        { translate: `${rule.translates.vflight_max}` },
      ],
    });
  }

  source.onScreenDisplay.setActionBar({
    rawtext: [
      { text: "§a" },
      { translate: `${rule.translates.vflight_enabled}` },
      { text: ` ${dragonName}` },
    ],
  });
  source.dimension.playSound(
    "random.levelup",
    source.location,
    getSoundOptions(),
  );
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
    if (boundDragons.length) {
      return showDragonScepterUI(source, itemStack, params);
    }
    return source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        { translate: `${params.translates.not_bound}` },
      ],
    });
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
  const dragonName = dragon.nameTag?.trim() || "Unnamed";
  if (!tameable) {
    return source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        {
          translate: "tooltip.dragonmounts2:dragon_scepter.untameable",
          with: [dragonName],
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
          with: [dragonName],
        },
      ],
    });
  }
  if (tameable.tamedToPlayerId !== source.id) {
    return source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        { translate: `${rule.translates.not_owned}`, with: [dragonName] },
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
          with: [dragonName],
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
        with: [dragonName],
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
  if (hitEntity?.isValid) {
    dragonUtilities.disableVFlight(hitEntity, "manual");
  }
}

function buildScepterLore(attackingEntity, dragonIds, dimension, rule) {
  const lines = [];
  if (!dragonIds?.length) return [];
  for (const pid of dragonIds) {
    const dragon = dimension
      ?.getEntities({ families: ["dragonmounts2"] })
      .find(
        (entity) =>
          entity?.isValid && getPersistentId(entity) === pid,
      );
    let dragonName = "Unnamed";
    if (dragon?.isValid) {
      dragonName = dragon.nameTag || "Unnamed";
    }
    lines.push({
      rawtext: [{ text: "§r§7" }, { translate: `${rule.translates.bound_to}` }],
    });
    lines.push(`§r§9 ${dragonName}`);
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

function showDragonScepterUI(source, itemStack, rule) {
  if (!getRidingDragon(source, rule)) {
    return source.onScreenDisplay.setActionBar({
      rawtext: [
        { text: "§c" },
        { translate: `${rule.translates.must_be_riding}` },
      ],
    });
  }

  const boundDragons = getOwnedBoundScepterDragons(source, itemStack, rule);
  if (!boundDragons.length)
    return source.onScreenDisplay.setActionBar({
      rawtext: [{ text: "§c" }, { translate: `${rule.translates.not_bound}` }],
    });

  const dragon = boundDragons[0];
  let dragonName = dragon.nameTag;
  if (!dragonName || dragonName.trim() === "") dragonName = "Unnamed";

  const scepterForm = new CustomForm(source, {
    translate: `${rule.translates.name}`,
  })
    .label({
      rawtext: [
        { translate: `${rule.translates.bound_to}` },
        { text: `${dragonName}` },
        { text: "\n\n" },
        { translate: `${rule.translates.select_command}` },
      ],
    })
    .button({ translate: `${rule.translates.toggle_vflight}` }, () => {
      try {
        scepterForm.close();
      } catch { }
      system.run(() => {
        const controllerDragon =
          source.getComponent("minecraft:riding")?.entityRidingOn;
        const activeDragons = getOwnedBoundScepterDragons(
          source,
          itemStack,
          rule,
        );
        const activeBoundDragons = activeDragons.filter(
          (dragon) =>
            dragon.getProperty("dragonmounts2:v_flight_enabled") === true,
        );
        if (activeBoundDragons.length) {
          for (const activeDragon of activeBoundDragons) {
            let activeDragonName = activeDragon.nameTag;
            if (!activeDragonName || activeDragonName.trim() === "")
              activeDragonName = "Unnamed";
            dragonUtilities.disableVFlight(activeDragon, "manual");
            source.onScreenDisplay.setActionBar({
              rawtext: [
                { text: "§e" },
                { translate: `${rule.translates.vflight_disabled}` },
                { text: ` ${activeDragonName}` },
              ],
            });
          }
          source.dimension.playSound(
            "random.break",
            source.location,
            getSoundOptions(),
          );
          return;
        }
        let enabled = 0;
        for (const activeDragon of activeDragons) {
          let activeDragonName = activeDragon.nameTag;
          if (!activeDragonName || activeDragonName.trim() === "")
            activeDragonName = "Unnamed";
          const started = dragonUtilities.startVFlight(
            activeDragon,
            source.id,
            source.dimension,
            controllerDragon,
          );
          if (started) {
            enabled++;
            source.onScreenDisplay.setActionBar({
              rawtext: [
                { text: "§a" },
                { translate: `${rule.translates.vflight_enabled}` },
                { text: ` ${activeDragonName}` },
              ],
            });
            source.dimension.playSound(
              "random.levelup",
              source.location,
              getSoundOptions(),
            );
          }
        }
        if (enabled === 0) {
          source.onScreenDisplay.setActionBar({
            rawtext: [
              { text: "§c" },
              { translate: `${rule.translates.vflight_no_target}` },
            ],
          });
        }
      });
    });

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

  const dragonHasCollar = dragon.getProperty("dragonmounts2:has_collar");
  const dragonIsFollowing = dragon.getProperty("dragonmounts2:is_following");
  const dragonIsLocked = dragon.getProperty("dragonmounts2:is_locked");
  const dragonMobState = dragon.getProperty("dragonmounts2:mob_state");
  let dragonName = dragon.nameTag;
  if (!dragonName || dragonName.trim() === "") dragonName = "Unnamed";

  const fluteForm = new CustomForm(source, {
    translate: `${rule.translates.name}`,
  })
    .label({
      rawtext: [
        { translate: `${rule.translates.bound_to}` },
        { text: `${dragonName}` },
        { text: "\n\n" },
        { translate: `${rule.translates.select_command}` },
      ],
    })
    .button({ translate: `${rule.translates.come_to_owner}` }, () => {
      try {
        fluteForm.close();
      } catch { }
      system.run(() => {
        if (!source?.isValid || !dragon?.isValid) return;
        if (dragon.getProperty("dragonmounts2:v_flight_enabled") === true) {
          dragonUtilities.disableVFlight(dragon, "manual");
        }
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
    })
    .button(
      {
        translate: `${(() => {
          const home = getDragonHome(dragon);
          return home && !isDragonAtHome(dragon, home)
            ? rule.translates.send_home
            : rule.translates.set_home;
        })()}`,
      },
      () => {
        try {
          fluteForm.close();
        } catch { }
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
          } catch { }
        });
      },
    )
    .button(
      dragonMobState == "standing"
        ? { translate: `${rule.translates.sit}` }
        : { translate: `${rule.translates.stand}` },
      () => {
        try {
          fluteForm.close();
        } catch { }
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
      () => {
        try {
          fluteForm.close();
        } catch { }
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
      () => {
        try {
          fluteForm.close();
        } catch { }
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
    )
    .button(
      dragonHasCollar == false
        ? { translate: `${rule.translates.collar}` }
        : { translate: `${rule.translates.no_collar}` },
      () => {
        try {
          fluteForm.close();
        } catch { }
        system.run(() => {
          if (dragonHasCollar == false) {
            source.onScreenDisplay.setActionBar({
              rawtext: [
                { text: "§a" },
                { translate: `${rule.translates.on_collar}` },
              ],
            });
            dragon.triggerEvent("minecraft:on_collar");
          } else {
            source.onScreenDisplay.setActionBar({
              rawtext: [
                { text: "§a" },
                { translate: `${rule.translates.off_collar}` },
              ],
            });
            dragon.triggerEvent("minecraft:on_no_collar");
          }
          source.dimension.playSound(
            rule.sounds.short,
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

    hitEntity.runCommand(`ride @a[r=3.1] stop_riding`);
    hitEntity.runCommand(`tp ${saveX} ${saveY} ${saveZ}`);
    hitEntity.runCommand(
      `structure save "${pid}" ${saveX} ${saveY} ${saveZ} ${saveX} ${saveY} ${saveZ} true disk false`,
    );
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
        { text: ` ${dragonName}` },
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
  const directions = {
    North: { x: pos.x + 0.5, y: pos.y, z: pos.z - 0.5 },
    South: { x: pos.x + 0.5, y: pos.y, z: pos.z + 1.5 },
    East: { x: pos.x + 1.5, y: pos.y, z: pos.z + 0.5 },
    West: { x: pos.x - 0.5, y: pos.y, z: pos.z + 0.5 },
    Up: { x: pos.x + 0.5, y: pos.y, z: pos.z + 0.5 },
    Down: { x: pos.x + 0.5, y: pos.y, z: pos.z + 0.5 },
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
        { text: ` ${data.dragonName ?? "Dragon"}` },
      ],
    });
  });
}

export function isShieldItem(itemStack) {
  return itemStack.hasComponent("dragonmounts2:dragon_scale_shield");
}

export function getShieldComponentData(itemStack) {
  if (!isShieldItem(itemStack)) return undefined;
  return itemStack.getComponent("dragonmounts2:dragon_scale_shield");
}

export function getShieldParameters(itemStack) {
  return getShieldComponentData(itemStack)?.customComponentParameters?.params;
}

export function getHeldShield(
  player,
  withCooldown = true,
  cooldownUntilTick = 0,
) {
  function isValidShield(itemStack) {
    if (!itemStack.hasComponent("dragonmounts2:dragon_scale_shield"))
      return false;
    if (withCooldown && cooldownUntilTick > system.currentTick) return false;
    if (withCooldown) {
      const cooldownComp = itemStack.getComponent(
        ItemCooldownComponent.componentId,
      );
      if (cooldownComp && cooldownComp.getCooldownTicksRemaining(player) > 0)
        return false;
    }
    return true;
  }
  const equippable = player.getComponent(EntityEquippableComponent.componentId);
  if (!equippable) return undefined;
  const mainhand = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
  const mainhandItem = mainhand.getItem();
  const offhand = equippable.getEquipmentSlot(EquipmentSlot.Offhand);
  const offItem = offhand.getItem();
  if (offItem?.typeId === "minecraft:shield") return undefined;
  if (offItem && isValidShield(offItem))
    return { item: offItem, slot: offhand, hand: "off_hand" };
  if (mainhandItem?.typeId === "minecraft:shield") return undefined;
  if (mainhandItem && isValidShield(mainhandItem)) {
    return { item: mainhandItem, slot: mainhand, hand: "main_hand" };
  }
  return undefined;
}

export function reduceDurability(player, item, damage) {
  if (player.getGameMode() === GameMode.creative) return item;
  const durComp = item.getComponent(ItemDurabilityComponent.componentId);
  if (!durComp) return item;
  const enchComp = item.getComponent(ItemEnchantableComponent.componentId);
  const unbreaking = enchComp?.getEnchantment("unbreaking");
  if (unbreaking !== undefined) {
    const chance = 100 / (unbreaking.level + 1);
    const random = Math.random() * 100;
    if (random >= 100 - chance) {
      if (durComp.damage + damage > durComp.maxDurability) {
        player.dimension.playSound(
          "random.break",
          player.location,
          getSoundOptions(),
        );
        return undefined;
      } else {
        durComp.damage += damage;
        return item;
      }
    }
    return item;
  }
  if (durComp.damage + damage > durComp.maxDurability) {
    player.dimension.playSound(
      "random.break",
      player.location,
      getSoundOptions(),
    );
    return undefined;
  } else {
    durComp.damage += damage;
    return item;
  }
}
