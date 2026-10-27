import {
  system,
  ItemStack,
  GameMode,
  EntityInventoryComponent,
  EntityEquippableComponent,
  EquipmentSlot,
  Player,
  world,
} from "@minecraft/server";
import * as blockData from "../data/block_data.js";
import * as itemData from "../data/item_data.js";
import { getSoundOptions } from "../data/settings.js";
import { spawnParticle } from "./particle_utilities.js";

const DRAGON_CORE_ID = "dragonmounts2:dragon_core";

function setBlockEntityRotation(blockEntity, cardinalDirection) {
  const rotations = {
    north: { x: 0, y: 0 },
    south: { x: 0, y: 180 },
    east: { x: 0, y: 90 },
    west: { x: 0, y: -90 },
  };
  const rotation = rotations[cardinalDirection];
  if (rotation) blockEntity.setRotation(rotation);
}

export function getCardinalDirectionFromRotation(rotationY) {
  const normalizedYaw = (((rotationY ?? 0) % 360) + 360) % 360;

  if (normalizedYaw < 45 || normalizedYaw >= 315) return "north";
  if (normalizedYaw < 135) return "east";
  if (normalizedYaw < 225) return "south";
  return "west";
}

export function restoreCardinalDirection(block, stateKey, cardinalDirection) {
  if (!block || cardinalDirection === undefined) return;
  const availableStates = block.permutation.getAllStates();
  if (Object.prototype.hasOwnProperty.call(availableStates, stateKey)) {
    block.setPermutation(
      block.permutation.withState(stateKey, cardinalDirection),
    );
  }
}

// Spawns the short-lived animation entity for the Dragon Core lid and puts the
// block itself into the matching transitional state (which hides the block's
// own bones so only the animated entity is visible).
//   animation: "opening" | "closing"
// The entity's own `core_state` is set by the spawn event, so the client
// always sees the requested animation from its first frame.
function playCoreAnimation(block, params, cardinalDirection, animation) {
  block.setPermutation(
    block.permutation.withState(params.states.core_state, animation),
  );
  const blockEntity = block.dimension.spawnEntity(
    params.block_entity,
    {
      x: block.center().x,
      y: block.center().y - 0.5,
      z: block.center().z,
    },
    {
      spawnEvent:
        animation === "opening"
          ? "minecraft:dragon_core_open"
          : "minecraft:dragon_core_close",
    },
  );
  setBlockEntityRotation(blockEntity, cardinalDirection);
  return blockEntity;
}

function removeCoreAnimationEntity(blockEntity) {
  try {
    if (blockEntity?.isValid) {
      blockEntity.triggerEvent("minecraft:dragon_core_destroyed");
    }
  } catch {
    // already despawned
  }
}

function getDragonEssenceDetails(itemStack) {
  if (!itemStack) return undefined;
  const lore = itemStack.getLore();

  return {
    ownerIdentifier:
      itemStack.getDynamicProperty("dragonmounts2:owner_identifier") ||
      lore[3]?.replace("§r§8 ", "") ||
      lore[0]?.replace("§r§bownerID: ", ""),
    variantType:
      itemStack.getDynamicProperty("dragonmounts2:variant_type") ||
      lore[5]?.replace("§r§9 ", "") ||
      lore[1]?.replace("§r§bvariant: ", "") ||
      "default",
    dragonName:
      itemStack.getDynamicProperty("dragonmounts2:dragon_name") ||
      lore[7]?.replace("§r§9 ", "") ||
      lore[2]?.replace("§r§bname: ", ""),
    dragonIdentifier:
      itemStack.getDynamicProperty("dragonmounts2:dragon_identifier") ||
      lore[8]?.replace("§r§8 ", ""),
  };
}

export function dragonEssenceUseOn(block, player, itemStack) {
  if (!block || !(player instanceof Player) || !player.isValid) return;

  const essenceEntry = Object.entries(itemData.dragonEssenceDataEntityTypes)
    .find(([, entry]) => entry.dragon_item === itemStack?.typeId);
  const essenceDetails = getDragonEssenceDetails(itemStack);
  if (!essenceEntry || !essenceDetails) return;
  if (
    essenceDetails.ownerIdentifier &&
    essenceDetails.ownerIdentifier !== player.id
  ) {
    player.sendMessage({
      rawtext: [
        { text: "§c" },
        { translate: "tooltip.dragonmounts2:dragon_not_owned" },
      ],
    });
    return;
  }

  const [dragonType, essenceData] = essenceEntry;
  if (
    block.dimension.id !== player.dimension.id ||
    block.isLiquid ||
    block.typeId === "minecraft:air"
  ) return;
  const spawnLocation = {
    x: block.location.x + 0.5,
    y: block.location.y + 1,
    z: block.location.z + 0.5,
  };
  const spawnBlockLocation = {
    x: Math.floor(spawnLocation.x),
    y: Math.floor(spawnLocation.y),
    z: Math.floor(spawnLocation.z),
  };
  const spawnBlock = player.dimension.getBlock(spawnBlockLocation);
  const spawnHeadBlock = player.dimension.getBlock({
    x: spawnBlockLocation.x,
    y: spawnBlockLocation.y + 1,
    z: spawnBlockLocation.z,
  });
  if (!spawnBlock?.isAir || !spawnHeadBlock?.isAir) {
    player.sendMessage({
      rawtext: [
        { text: "§c" },
        { translate: "tooltip.dragonmounts2:dragon_essence.blocked" },
      ],
    });
    return;
  }

  let dragon;
  try {
    dragon = player.dimension.spawnEntity(dragonType, spawnLocation);
    if (!dragon?.isValid) throw new Error("Baby dragon could not spawn");
    dragon.triggerEvent("minecraft:spawn_as_baby");
    if (essenceDetails.variantType && essenceDetails.variantType !== "default") {
      try {
        dragon.triggerEvent(`minecraft:become_${essenceDetails.variantType}`);
      } catch {
        dragon.setProperty(
          essenceData.dragon_data.variant_property,
          essenceDetails.variantType,
        );
      }
    }
    const tameable = dragon.getComponent("minecraft:tameable");
    if (!tameable?.tame(player)) {
      throw new Error("Baby dragon could not be assigned to its owner");
    }
    dragon.setDynamicProperty("dragonmounts2:owner_identifier", player.id);
    dragon.setDynamicProperty("dragonmounts2:owner_name", player.name);
    if (essenceDetails.dragonIdentifier) {
      dragon.setDynamicProperty(
        "dragonmounts2:dragon_identifier",
        essenceDetails.dragonIdentifier,
      );
    }
    dragon.nameTag =
      essenceDetails.dragonName === "Unnamed"
        ? ""
        : essenceDetails.dragonName ?? "";

    if (player.getGameMode() !== GameMode.creative) {
      const mainhand = player
        .getComponent(EntityEquippableComponent.componentId)
        ?.getEquipmentSlot(EquipmentSlot.Mainhand);
      const heldItem = mainhand?.getItem();
      if (heldItem?.typeId !== itemStack.typeId) {
        throw new Error("Dragon essence is no longer held in the main hand");
      }
      mainhand.setItem(heldItem.amount > 1
        ? new ItemStack(heldItem.typeId, heldItem.amount - 1)
        : undefined);
    }
  } catch (error) {
    if (dragon?.isValid) {
      try {
        dragon.remove();
      } catch (removeError) {
        console.error(`[DragonMounts2] Failed to roll back essence dragon: ${removeError?.message ?? removeError}`);
      }
    }
    console.warn(`[DragonMounts2] Dragon essence use failed: ${error?.message ?? error}`);
    return;
  }

  player.dimension.playSound(
    "dragonmounts2:item.dragon_essence",
    spawnLocation,
    getSoundOptions({ volume: 1.2 }),
  );
}

// ---- Dragon Core storage -------------------------------------------------
// The core block has no container. The essence a dead dragon leaves behind is
// kept as plain data in a world dynamic property keyed by the core's position
// (stable API, no experiments).
function getDragonCoreKey(dimension, location) {
  return `dragonmounts2:core:${dimension.id}:${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`;
}

function readDragonCoreEssence(dimension, location) {
  const raw = world.getDynamicProperty(getDragonCoreKey(dimension, location));
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function clearDragonCoreEssence(dimension, location) {
  world.setDynamicProperty(getDragonCoreKey(dimension, location), undefined);
}

export function createDragonEssenceItem(data) {
  const essenceItem = new ItemStack(data.dragon_item, 1);
  essenceItem.setLore([
    {
      rawtext: [
        { text: `${data.textColorType}` },
        { translate: `${data.textTranslateType}` },
      ],
    },
    {
      rawtext: [
        { text: "§r§7" },
        { translate: "tooltip.dragonmounts2:dragon_owner_name" },
        { text: ":" },
      ],
    },
    `§r§9 ${data.ownerName}`,
    `§r§8 ${data.ownerIdentifier}`,
    {
      rawtext: [
        { text: "§r§7" },
        { translate: "tooltip.dragonmounts2:dragon_variant_type" },
        { text: ":" },
      ],
    },
    `§r§9 ${data.variantType}`,
    {
      rawtext: [
        { text: "§r§7" },
        { translate: "tooltip.dragonmounts2:dragon_name" },
        { text: ":" },
      ],
    },
    `§r§9 ${data.dragonName}`,
    `§r§8 ${data.dragonIdentifier}`,
  ]);
  essenceItem.setDynamicProperty(
    "dragonmounts2:owner_identifier",
    data.ownerIdentifier,
  );
  essenceItem.setDynamicProperty("dragonmounts2:variant_type", data.variantType);
  essenceItem.setDynamicProperty("dragonmounts2:dragon_name", data.dragonName);
  essenceItem.setDynamicProperty(
    "dragonmounts2:dragon_identifier",
    data.dragonIdentifier,
  );
  return essenceItem;
}

function destroyDragonCore(block, dimension) {
  const center = block.center();
  dimension.playSound("random.enderchestopen", center, getSoundOptions({ volume: 0.9 }));
  dimension.playSound("break.amethyst_block", center, getSoundOptions());
  dimension.playSound(
    "dragonmounts2:item.dragon_essence",
    center,
    getSoundOptions({ volume: 1.2 }),
  );
  spawnParticle(dimension, "dragonmounts2:dragon_core_inner_cloud", center);
  block.setType("minecraft:air");
  spawnParticle(dimension, "dragonmounts2:dragon_core_outer_cloud", center);
  system.runTimeout(() => {
    spawnParticle(dimension, "dragonmounts2:dragon_core_outer_cloud", center);
  }, 20);
}

function returnDragonCoreItem(itemStack, player, dimension, block) {
  if (!player?.isValid) {
    dimension.spawnItem(itemStack, block.center());
    return;
  }

  const inventory = player.getComponent(EntityInventoryComponent.componentId)
    ?.container;
  if (!inventory) {
    dimension.spawnItem(itemStack, player.location);
    return;
  }

  const remainder = inventory.addItem(itemStack);
  if (remainder) dimension.spawnItem(remainder, player.location);
}

// Revival sequence for an empty core that is given a Dragon Essence.
function performCoreRevival(
  block,
  dimension,
  player,
  params,
  essenceData,
  essenceDetails,
) {
  const savedVariant = essenceDetails.variantType;
  let dragonName = essenceDetails.dragonName;
  const { x, y, z } = block.center();
  const cardinalDirection = block.permutation.getState(params.states.cardinal);

  block.setPermutation(
    block.permutation.withState(params.states.core_used, true),
  );

  system.runTimeout(() => {
    dimension.playSound(
      "block.enchanting_table.use",
      block.center(),
      getSoundOptions({ volume: 0.6, pitch: 0.4 }),
    );
    dimension.playSound(
      "block.end_portal.fill",
      block.center(),
      getSoundOptions({ pitch: 0.8 }),
    );
    dimension.playSound(
      "dragonmounts2:block.dragon_core",
      block.center(),
      getSoundOptions({ volume: 1.2, pitch: 0.7 }),
    );

    // 0-10 ticks: the lid lifts and spins open (opening animation).
    // (If the player already opened the lid to insert the essence, keep it open.)
    let animationEntity;
    if (block.permutation.getState(params.states.core_state) === "closed") {
      animationEntity = playCoreAnimation(block, params, cardinalDirection, "opening");
    } else {
      cancelCoreLidAnimation(block);
      block.setPermutation(
        block.permutation.withState(params.states.core_state, "open"),
      );
    }
    spawnParticle(
      dimension,
      "dragonmounts2:dragon_core_inner_cloud",
      block.center(),
    );

    // 10 ticks: hand over to the block's own static "open" model.
    system.runTimeout(() => {
      if (!block.isValid || block.typeId !== DRAGON_CORE_ID) return;
      block.setPermutation(
        block.permutation.withState(params.states.core_state, "open"),
      );
      removeCoreAnimationEntity(animationEntity);
      spawnParticle(
        dimension,
        "dragonmounts2:dragon_core_inner_cloud",
        block.center(),
      );
    }, 10);

    // 30-40 ticks: the lid closes again (closing animation).
    system.runTimeout(() => {
      if (!block.isValid || block.typeId !== DRAGON_CORE_ID) return;
      animationEntity = playCoreAnimation(
        block,
        params,
        cardinalDirection,
        "closing",
      );
      spawnParticle(
        dimension,
        "dragonmounts2:dragon_core_inner_cloud",
        block.center(),
      );
    }, 30);

    // 40 ticks: the spent core crumbles away.
    system.runTimeout(() => {
      if (block.isValid && block.typeId === DRAGON_CORE_ID) {
        block.setType(params.block_transforms_into);
        restoreCardinalDirection(
          block,
          params.states.cardinal,
          cardinalDirection,
        );
      }
      removeCoreAnimationEntity(animationEntity);
      coreLids.delete(getDragonCoreKey(dimension, block.location));
      spawnParticle(
        dimension,
        "dragonmounts2:dragon_core_outer_cloud",
        block.center(),
      );
    }, 40);

    system.runTimeout(() => {
      spawnParticle(
        dimension,
        "dragonmounts2:dragon_core_outer_cloud",
        block.center(),
      );
    }, 50);

    system.runTimeout(() => {
      dimension.playSound(
        "dragonmounts2:item.dragon_essence",
        block.center(),
        getSoundOptions({ volume: 1.2 }),
      );
      // Java DM2: a revived dragon always comes back as a baby, but keeps its
      // saved variant. entity_transformed spawns a baby with a random variant,
      // then the saved variant is re-applied on top of it.
      const dragon = dimension.spawnEntity(
        essenceData.dragon_entity,
        { x, y: y - 0.5, z },
        { spawnEvent: "minecraft:entity_transformed" },
      );

      if (dragon) {
        if (savedVariant && savedVariant !== "default") {
          try {
            dragon.triggerEvent(`minecraft:become_${savedVariant}`);
          } catch (error) {
            console.warn(
              `[DragonMounts2] Unknown variant "${savedVariant}" for ${essenceData.dragon_entity}: ${error?.message ?? error}`,
            );
          }
        }
        if (dragon.hasComponent("minecraft:tameable")) {
          const tameable = dragon.getComponent("minecraft:tameable");
          tameable.tame(player);
        }
        if (dragonName === "Unnamed") dragonName = "";
        dragon.nameTag = dragonName;
        if (essenceDetails.dragonIdentifier) {
          dragon.setDynamicProperty(
            "dragonmounts2:dragon_identifier",
            essenceDetails.dragonIdentifier,
          );
        }
      }
    }, 60);
  }, 0);

  return true;
}

// Java DM2: when a tamed dragon dies, a Dragon Core is left on the floor with
// the dragon's essence inside. Right-clicking it hands you the essence and the
// core is destroyed; you then place the essence on the ground to bring the
// dragon back as a baby (see dragonEssenceUseOn).
// Returns true if the core was placed, false if the caller should drop the
// essence instead.
export function spawnDragonCoreWithEssence(dimension, location, essenceData) {
  let placed;
  try {
    const x = Math.floor(location.x);
    const y = Math.floor(location.y);
    const z = Math.floor(location.z);
    const target = dimension.getBlock({ x, y, z });
    if (!target || (!target.isAir && !target.isLiquid)) return false;

    target.setType(DRAGON_CORE_ID);
    placed = target;
    placed.setPermutation(
      placed.permutation.withState("dragonmounts2:core_used", true),
    );
    world.setDynamicProperty(
      getDragonCoreKey(dimension, placed.location),
      JSON.stringify(essenceData),
    );

    const center = placed.center();
    dimension.playSound("break.amethyst_block", center, getSoundOptions());
    spawnParticle(dimension, "dragonmounts2:dragon_core_inner_cloud", center);
    try {
      ensureCoreContainer(dimension, placed.location);
    } catch (error) {
      console.warn(
        `[DragonMounts2] Dragon Core container spawn failed: ${error?.message ?? error}`,
      );
    }
    return true;
  } catch (error) {
    console.warn(
      `[DragonMounts2] Dragon Core spawn failed: ${error?.message ?? error}`,
    );
    try {
      if (placed) clearDragonCoreEssence(dimension, placed.location);
      if (placed?.isValid && placed.typeId === DRAGON_CORE_ID) {
        placed.setType("minecraft:air");
      }
    } catch {
      // ignore cleanup failure
    }
    return false;
  }
}

// A core that still holds an essence (or has an item inside) was broken or
// blown up: don't lose it.
export function dragonCoreBroken(event) {
  const permutation =
    event.brokenBlockPermutation ?? event.explodedBlockPermutation;
  if (permutation?.type?.id !== DRAGON_CORE_ID) return;
  recoverCoreContents(event.dimension, event.block.location);
}

function sendCoreMessage(player, translationKey) {
  player.sendMessage({
    rawtext: [{ text: "§c" }, { translate: translationKey }],
  });
}

// ---- Dragon Core container ------------------------------------------------
// The core is a real 1-slot container, exactly like a chest: an invisible
// `dragonmounts2:dragon_core_container` entity sits inside the block. Its
// native inventory screen is restyled by the resource pack
// (ui/chest_screen.json + ui/dragon_core_ui.json), which recognises the
// marker at the end of the entity's name.
//   - Put your Dragon Essence in the slot  -> the dragon is revived.
//   - Take the essence out of a dead dragon's core -> the core crumbles.
const CORE_CONTAINER_ID = "dragonmounts2:dragon_core_container";
// Trigger name: the resource pack only shows the custom Dragon Core screen
// when the container's title is exactly this string.
// Keep in sync with ui/chest_screen.json.
const CORE_CONTAINER_TITLE = "§F§l§a§g§r§T§i§t§l§e§r";
const CORE_CONTAINER_DESTROYED_EVENT = "dragonmounts2:core_container_destroyed";
const CORE_NEARBY_RADIUS = 8;
const CORE_BUSY_PROPERTY = "dragonmounts2:core_busy";
const CORE_SEEDED_PROPERTY = "dragonmounts2:core_seeded";
// Mirrors the "dragonmounts2:dragon_core" custom component params in
// blocks/dragonmounts2_nature/dragon_core.json.
const CORE_PARAMS = {
  block_entity: "dragonmounts2:dragon_core",
  block_transforms_into: "minecraft:air",
  states: {
    cardinal: "minecraft:cardinal_direction",
    core_state: "dragonmounts2:core_state",
    core_used: "dragonmounts2:core_used",
  },
};
const CORE_DIMENSIONS = ["overworld", "nether", "the_end"];

// ---- Dragon Core lid ------------------------------------------------------
// Players use the invisible container entity, not the block, so the lid is
// driven by the entity container events: opening the container opens the lid,
// closing the screen closes it. Like a shulker box, spam-opening just reverses
// whatever the lid is doing, so animations never stack.
const CORE_LID_ANIMATION_TICKS = 10;
// key -> { token, entity, closeRequested }
const coreLids = new Map();

function getCoreLidRecord(block) {
  const key = getDragonCoreKey(block.dimension, block.location);
  let record = coreLids.get(key);
  if (!record) {
    record = { token: 0, entity: undefined, closeRequested: false };
    coreLids.set(key, record);
  }
  return record;
}

function getCoreLidState(block) {
  return block.permutation.getState(CORE_PARAMS.states.core_state);
}

function setCoreLidState(block, state) {
  block.setPermutation(
    block.permutation.withState(CORE_PARAMS.states.core_state, state),
  );
}

// Stops any lid animation in progress (invalidates its pending timeout).
function cancelCoreLidAnimation(block) {
  const record = getCoreLidRecord(block);
  record.token++;
  removeCoreAnimationEntity(record.entity);
  record.entity = undefined;
  return record;
}

function startCoreLidAnimation(block, animation) {
  const record = cancelCoreLidAnimation(block);
  const token = record.token;
  const cardinal = block.permutation.getState(CORE_PARAMS.states.cardinal);
  record.entity = playCoreAnimation(block, CORE_PARAMS, cardinal, animation);
  system.runTimeout(() => {
    if (record.token !== token) return; // reversed or cancelled meanwhile
    if (block.isValid && block.typeId === DRAGON_CORE_ID) {
      setCoreLidState(block, animation === "opening" ? "open" : "closed");
    }
    removeCoreAnimationEntity(record.entity);
    record.entity = undefined;
    // The screen was closed while the lid was still opening: close it now.
    if (animation === "opening" && record.closeRequested) {
      record.closeRequested = false;
      if (block.isValid && block.typeId === DRAGON_CORE_ID) closeCoreLid(block);
    }
  }, CORE_LID_ANIMATION_TICKS);
}

function openCoreLid(block) {
  const record = getCoreLidRecord(block);
  record.closeRequested = false;
  const state = getCoreLidState(block);
  if (state === "closed" || state === "closing") {
    startCoreLidAnimation(block, "opening");
  }
}

function closeCoreLid(block) {
  const state = getCoreLidState(block);
  if (state === "open") {
    startCoreLidAnimation(block, "closing");
  } else if (state === "opening") {
    getCoreLidRecord(block).closeRequested = true;
  }
}

// Resolves the core block for a container-entity event; undefined when the
// event is about something else, or while the core is reviving a dragon.
function getCoreBlockForContainerEvent(entity) {
  if (entity?.typeId !== CORE_CONTAINER_ID || !entity.isValid) return undefined;
  if (entity.getDynamicProperty(CORE_BUSY_PROPERTY)) return undefined;
  const block = entity.dimension.getBlock(coreBlockLocation(entity));
  return block?.typeId === DRAGON_CORE_ID ? block : undefined;
}

// world.afterEvents.entityContainerOpened
export function dragonCoreContainerOpened(event) {
  const block = getCoreBlockForContainerEvent(event.entity);
  if (block) openCoreLid(block);
}

// world.afterEvents.entityContainerClosed
export function dragonCoreContainerClosed(event) {
  const block = getCoreBlockForContainerEvent(event.entity);
  if (block) closeCoreLid(block);
}

// Safety net, called every few ticks for each core that is not reviving.
function tickCoreLid(block, players) {
  const record = getCoreLidRecord(block);
  const state = getCoreLidState(block);
  if (state === "open") {
    // No one near the core (disconnected, teleported): nobody can be using it.
    if (!record.entity && players.length === 0) closeCoreLid(block);
  } else if ((state === "opening" || state === "closing") && !record.entity) {
    // Left in a transitional state (reload, unloaded chunk): settle it.
    setCoreLidState(block, state === "opening" ? "open" : "closed");
  }
}

function coreBlockLocation(entity) {
  const { x, y, z } = entity.location;
  return { x: Math.floor(x), y: Math.floor(y + 0.25), z: Math.floor(z) };
}

function getCoreContainer(entity) {
  return entity?.getComponent(EntityInventoryComponent.componentId)?.container;
}

function findCoreContainer(dimension, location) {
  const center = {
    x: Math.floor(location.x) + 0.5,
    y: Math.floor(location.y) + 0.5,
    z: Math.floor(location.z) + 0.5,
  };
  return dimension
    .getEntities({ type: CORE_CONTAINER_ID, location: center, maxDistance: 1 })
    .find((entity) => entity.isValid);
}

function destroyCoreContainer(entity) {
  try {
    if (entity?.isValid) entity.triggerEvent(CORE_CONTAINER_DESTROYED_EVENT);
  } catch {
    // already despawning
  }
}

// Makes sure the core block has its container entity (and, for a dead
// dragon's core, that the essence is inside it).
export function ensureCoreContainer(dimension, blockLocation) {
  let entity = findCoreContainer(dimension, blockLocation);
  if (!entity) {
    entity = dimension.spawnEntity(CORE_CONTAINER_ID, {
      x: Math.floor(blockLocation.x) + 0.5,
      y: Math.floor(blockLocation.y),
      z: Math.floor(blockLocation.z) + 0.5,
    });
  }
  if (entity.nameTag !== CORE_CONTAINER_TITLE) {
    entity.nameTag = CORE_CONTAINER_TITLE;
  }
  seedCoreContainer(entity, dimension, blockLocation);
  return entity;
}

function seedCoreContainer(entity, dimension, blockLocation) {
  if (entity.getDynamicProperty(CORE_SEEDED_PROPERTY)) return;
  const stored = readDragonCoreEssence(dimension, blockLocation);
  const container = getCoreContainer(entity);
  if (!container) return;
  if (stored) container.setItem(0, createDragonEssenceItem(stored));
  entity.setDynamicProperty(CORE_SEEDED_PROPERTY, true);
}

// Drops whatever the core still holds (stored essence or an item that was
// being inserted) and removes the container entity.
function recoverCoreContents(dimension, location) {
  const stored = readDragonCoreEssence(dimension, location);
  const entity = findCoreContainer(dimension, location);
  const container = getCoreContainer(entity);
  const inside = container?.getItem(0);
  const dropAt = {
    x: Math.floor(location.x) + 0.5,
    y: Math.floor(location.y) + 0.5,
    z: Math.floor(location.z) + 0.5,
  };
  try {
    if (stored) {
      clearDragonCoreEssence(dimension, location);
      dimension.spawnItem(createDragonEssenceItem(stored), dropAt);
    } else if (inside && !entity?.getDynamicProperty(CORE_BUSY_PROPERTY)) {
      dimension.spawnItem(inside, dropAt);
    }
  } catch (error) {
    console.error(
      `[DragonMounts2] Dragon essence drop failed: ${error?.message ?? error}`,
    );
  }
  try {
    container?.setItem(0, undefined);
  } catch {
    // entity already gone
  }
  destroyCoreContainer(entity);
}

function getNearbyPlayers(dimension, location) {
  return dimension
    .getPlayers({ location, maxDistance: CORE_NEARBY_RADIUS })
    .sort((a, b) => {
      const da = (a.location.x - location.x) ** 2 + (a.location.z - location.z) ** 2;
      const db = (b.location.x - location.x) ** 2 + (b.location.z - location.z) ** 2;
      return da - db;
    });
}

function processCoreContainer(dimension, entity) {
  if (!entity?.isValid) return;
  const container = getCoreContainer(entity);
  if (!container) return;

  const blockLocation = coreBlockLocation(entity);
  const block = dimension.getBlock(blockLocation);
  if (!block) return; // chunk not ready
  if (block.typeId !== DRAGON_CORE_ID) {
    // The core is gone: hand back anything left inside and despawn.
    const leftover = container.getItem(0);
    if (leftover && !entity.getDynamicProperty(CORE_BUSY_PROPERTY)) {
      dimension.spawnItem(leftover, entity.location);
    }
    container.setItem(0, undefined);
    destroyCoreContainer(entity);
    return;
  }

  if (entity.nameTag !== CORE_CONTAINER_TITLE) {
    entity.nameTag = CORE_CONTAINER_TITLE;
  }
  seedCoreContainer(entity, dimension, blockLocation);
  if (entity.getDynamicProperty(CORE_BUSY_PROPERTY)) return; // reviving

  const stored = readDragonCoreEssence(dimension, blockLocation);
  const item = container.getItem(0);
  const players = getNearbyPlayers(dimension, entity.location);
  tickCoreLid(block, players);

  // --- A dead dragon's core: taking the essence out makes the core crumble.
  if (stored) {
    if (item && item.typeId === stored.dragon_item) return;
    clearDragonCoreEssence(dimension, blockLocation);
    if (item) {
      container.setItem(0, undefined);
      returnDragonCoreItem(item, players[0], dimension, block);
    }
    destroyCoreContainer(entity);
    destroyDragonCore(block, dimension);
    return;
  }

  // --- An empty core.
  const coreUsed =
    block.permutation.getState(CORE_PARAMS.states.core_used) === true;
  if (!item) {
    // Leftover used core with nothing inside: just let it crumble.
    if (coreUsed) {
      destroyCoreContainer(entity);
      destroyDragonCore(block, dimension);
    }
    return;
  }

  const reject = (translationKey) => {
    container.setItem(0, undefined);
    returnDragonCoreItem(item, players[0], dimension, block);
    if (players[0]?.isValid) sendCoreMessage(players[0], translationKey);
  };

  const essenceData = itemData.dragonEssenceDataItemTypes[item.typeId];
  const essenceDetails = getDragonEssenceDetails(item);
  if (!essenceData || !essenceDetails) {
    reject("tooltip.dragonmounts2:dragon_core.only_essences");
    return;
  }
  const owner = players.find(
    (player) => player.id === essenceDetails.ownerIdentifier,
  );
  if (!owner) {
    reject("tooltip.dragonmounts2:dragon_not_owned");
    return;
  }
  const blockAbove = block.above(1);
  if (!blockAbove || (!blockAbove.isAir && !blockAbove.isLiquid)) {
    reject("tooltip.dragonmounts2:dragon_core.blocked_above");
    return;
  }
  if (coreUsed) {
    reject("tooltip.dragonmounts2:dragon_core.only_essences");
    return;
  }

  // Accept: consume one essence, give any extras back, start the revival.
  container.setItem(0, undefined);
  if (item.amount > 1) {
    const rest = item.clone();
    rest.amount = item.amount - 1;
    returnDragonCoreItem(rest, owner, dimension, block);
  }
  entity.setDynamicProperty(CORE_BUSY_PROPERTY, true);
  performCoreRevival(block, dimension, owner, CORE_PARAMS, essenceData, essenceDetails);
}

// Scheduled task: watches every core's slot so the container behaves like an
// inventory (insert -> revive, take out -> crumble, junk -> given back).
export function tickDragonCores() {
  for (const id of CORE_DIMENSIONS) {
    let dimension;
    let entities;
    try {
      dimension = world.getDimension(id);
      entities = dimension.getEntities({ type: CORE_CONTAINER_ID });
    } catch {
      continue;
    }
    for (const entity of entities) {
      try {
        processCoreContainer(dimension, entity);
      } catch (error) {
        console.warn(
          `[DragonMounts2] Dragon Core container failed: ${error?.message ?? error}`,
        );
      }
    }
  }
}

// The container entity's hitbox sits in front of the block, so hitting the
// core hits the entity. Treat that as breaking the block.
export function dragonCoreContainerHit(event) {
  const { damagingEntity, hitEntity } = event;
  if (hitEntity?.typeId !== CORE_CONTAINER_ID) return;
  if (!(damagingEntity instanceof Player)) return;
  const dimension = hitEntity.dimension;
  const blockLocation = coreBlockLocation(hitEntity);
  const block = dimension.getBlock(blockLocation);
  if (!block || block.typeId !== DRAGON_CORE_ID) return;

  recoverCoreContents(dimension, blockLocation);
  if (damagingEntity.getGameMode() === GameMode.creative) {
    block.setType("minecraft:air");
  } else {
    dimension.runCommand(
      `setblock ${blockLocation.x} ${blockLocation.y} ${blockLocation.z} air destroy`,
    );
  }
}

export function dragonCorePlaced(block, dimension) {
  // Delayed so a dead dragon's essence is already stored when we seed it.
  system.runTimeout(() => {
    try {
      if (block?.isValid && block.typeId === DRAGON_CORE_ID) {
        ensureCoreContainer(dimension, block.location);
      }
    } catch (error) {
      console.warn(
        `[DragonMounts2] Dragon Core container spawn failed: ${error?.message ?? error}`,
      );
    }
  }, 2);
}

// Fallback: if the click reached the block (no container entity yet, or the
// click missed its hitbox), make sure the container exists.
export function dragonCorePlayerInteract(block, dimension, player) {
  if (!player?.isValid || !block) return;
  if (!blockData.dragonCoreBlockTypes.includes(block.typeId)) return;
  ensureCoreContainer(dimension, block.location);
  player.onScreenDisplay.setActionBar("§7Right-click the Dragon Core again to open it.");
}

export function dragonEggRandomTick(block, dimension, params) {
  spawnParticle(
    dimension,
    params.particles.random_tick_particle,
    block.center(),
  );
}

export function dragonEggPlayerInteract(block, dimension, player, params) {
  const cardinalDirection = block.permutation.getState(params.states.cardinal);

  block.setType(params.block_transforms_into);
  restoreCardinalDirection(block, params.states.cardinal, cardinalDirection);
  dimension.playSound(
    params.sounds.interact_sound,
    block.center(),
    getSoundOptions(),
  );

  const blockEntity = block.dimension.spawnEntity(params.block_entity, {
    x: block.center().x,
    y: block.center().y - 0.5,
    z: block.center().z,
  });

  if (blockEntity?.isValid && player?.isValid) {
    blockEntity.setDynamicProperty(
      "dragonmounts2:hatch_owner_identifier",
      player.id,
    );
  }
  setBlockEntityRotation(blockEntity, cardinalDirection);

  spawnParticle(dimension, params.particles.interact_particle, block.center());
}
