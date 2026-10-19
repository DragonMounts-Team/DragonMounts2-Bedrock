import {
  system,
  GameMode,
  EntityInventoryComponent,
  EntityEquippableComponent,
  EquipmentSlot,
  world,
} from "@minecraft/server";
import * as blockData from "../data/block_data.js";
import * as itemData from "../data/item_data.js";
import { getSoundOptions } from "../data/settings.js";

const dragonCoreContainerSessions = new Map();

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

function animateCore(
  block,
  dimension,
  params,
  state,
  sound1,
  sound2,
  spawnEvent,
) {
  const cardinalDirection = block.permutation.getState(params.states.cardinal);

  system.runTimeout(() => {
    block.dimension.playSound(
      sound1,
      block.center(),
      getSoundOptions({ volume: 0.9 }),
    );
    block.dimension.playSound(
      sound2,
      block.center(),
      getSoundOptions({ volume: 0.1 }),
    );
    block.setPermutation(
      block.permutation.withState(params.states.core_state, state),
    );

    const blockEntity = block.dimension.spawnEntity(
      params.block_entity,
      {
        x: block.center().x,
        y: block.center().y - 0.5,
        z: block.center().z,
      },
      { spawnEvent: spawnEvent },
    );

    setBlockEntityRotation(blockEntity, cardinalDirection);

    system.runTimeout(() => {
      block.setPermutation(
        block.permutation.withState(
          params.states.core_state,
          state === "opening" ? "open" : "closed",
        ),
      );
      blockEntity.triggerEvent("minecraft:dragon_core_destroyed");
    }, 10);
  }, 0);
}

function getDragonEssenceDetails(itemStack) {
  const lore = itemStack.getLore();
  if (!lore.length) return undefined;

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
  if (!block || !player?.isValid) return;

  const essenceEntry = Object.entries(itemData.dragonEssenceDataEntityTypes)
    .find(([, entry]) => entry.dragon_item === itemStack?.typeId);
  const essenceDetails = getDragonEssenceDetails(itemStack);
  if (!essenceEntry || !essenceDetails) return;
  if (essenceDetails.ownerIdentifier !== player.id) {
    player.sendMessage({
      rawtext: [
        { text: "§c" },
        { translate: "tooltip.dragonmounts2:dragon_not_owned" },
      ],
    });
    return;
  }

  const [dragonType, essenceData] = essenceEntry;
  const spawnLocation = {
    x: block.location.x + 0.5,
    y: block.location.y + 1,
    z: block.location.z + 0.5,
  };
  const dragon = player.dimension.spawnEntity(dragonType, spawnLocation);
  if (!dragon) return;

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
  dragon.getComponent("minecraft:tameable")?.tame(player);
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
    if (mainhand?.getItem()?.typeId === itemStack.typeId) {
      mainhand.setItem(undefined);
    }
  }
  player.dimension.playSound(
    "dragonmounts2:item.dragon_essence",
    spawnLocation,
    getSoundOptions({ volume: 1.2 }),
  );
}

function isPlayerNearCore(player, dimension, block) {
  if (!player.isValid || player.dimension.id !== dimension.id) return false;
  const playerLocation = player.location;
  const coreLocation = block.center();
  const deltaX = playerLocation.x - coreLocation.x;
  const deltaY = playerLocation.y - coreLocation.y;
  const deltaZ = playerLocation.z - coreLocation.z;
  return deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ <= 36;
}

function closeDragonCore(block, dimension, params) {
  if (!block || block.typeId !== "dragonmounts2:dragon_core") return;
  if (block.permutation.getState(params.states.core_state) !== "open") {
    return;
  }

  animateCore(
    block,
    dimension,
    params,
    "closing",
    "random.enderchestclosed",
    "",
    "minecraft:dragon_core_close",
  );
}

function destroyEmptyDragonCore(block, dimension, params) {
  const { x, y, z } = block.location;
  const location = { x, y, z };
  const center = block.center();
  closeDragonCore(block, dimension, params);

  system.runTimeout(() => {
    const currentBlock = dimension.getBlock(location);
    const remainingItem = currentBlock
      ?.getComponent("inventory")
      ?.container?.getItem(0);
    if (
      currentBlock?.typeId !== "dragonmounts2:dragon_core" ||
      currentBlock.permutation.getState(params.states.core_used) !== true ||
      remainingItem
    )
      return;

    dimension.playSound("break.amethyst_block", center, getSoundOptions());
    dimension.playSound(
      "dragonmounts2:item.dragon_essence",
      center,
      getSoundOptions({ volume: 1.2 }),
    );
    dimension.spawnParticle("dragonmounts2:dragon_core_inner_cloud", center);
    currentBlock.setType(params.block_transforms_into);
    dimension.spawnParticle("dragonmounts2:dragon_core_outer_cloud", center);
  }, 12);

  system.runTimeout(() => {
    dimension.spawnParticle("dragonmounts2:dragon_core_outer_cloud", center);
  }, 32);
}

function getDragonCoreSessionKey(block) {
  const { x, y, z } = block.location;
  return `${block.dimension.id}:${x},${y},${z}`;
}

function trackDragonCoreContainerUser(block, player, params) {
  const sessionKey = getDragonCoreSessionKey(block);
  const session = dragonCoreContainerSessions.get(sessionKey);
  if (!session) {
    dragonCoreContainerSessions.set(sessionKey, {
      playerId: player.id,
      contested: false,
      params,
    });
  } else if (session.playerId !== player.id) {
    session.contested = true;
  }
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

function hatchDragonCore(block, dimension, player, params, itemStack) {
  const essenceItemData = itemData.dragonEssenceDataItemTypes;
  const essenceDetails = getDragonEssenceDetails(itemStack);
  const essenceData = essenceItemData[itemStack.typeId];
  if (!essenceData || !essenceDetails || essenceDetails.ownerIdentifier !== player.id) {
    return false;
  }

  const coreState = block.permutation.getState(params.states.core_state);
  const coreUsed = block.permutation.getState(params.states.core_used);
  if (coreState !== "open" || coreUsed === true) return false;

  const variantHatched =
    essenceData.dragon_hatch_variants[essenceDetails.variantType];
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

    block.setPermutation(
      block.permutation.withState(params.states.core_state, "closing"),
    );

    const blockEntity = dimension.spawnEntity(params.block_entity, {
      x: block.center().x,
      y: block.center().y - 0.5,
      z: block.center().z,
    });

    setBlockEntityRotation(blockEntity, cardinalDirection);
    blockEntity.setProperty("dragonmounts2:core_state", "open");

    dimension.spawnParticle(
      "dragonmounts2:dragon_core_inner_cloud",
      block.center(),
    );

    system.runTimeout(() => {
      blockEntity.triggerEvent("minecraft:dragon_core_close");
      dimension.spawnParticle(
        "dragonmounts2:dragon_core_inner_cloud",
        block.center(),
      );
    }, 10);

    system.runTimeout(() => {
      block.setType(params.block_transforms_into);
      restoreCardinalDirection(
        block,
        params.states.cardinal,
        cardinalDirection,
      );
      blockEntity.triggerEvent("minecraft:dragon_core_destroyed");
      dimension.spawnParticle(
        "dragonmounts2:dragon_core_outer_cloud",
        block.center(),
      );
    }, 20);

    system.runTimeout(() => {
      dimension.spawnParticle(
        "dragonmounts2:dragon_core_outer_cloud",
        block.center(),
      );
    }, 40);

    system.runTimeout(() => {
      dimension.playSound(
        "dragonmounts2:item.dragon_essence",
        block.center(),
        getSoundOptions({ volume: 1.2 }),
      );
      const dragon = dimension.spawnEntity(
        essenceData.dragon_entity,
        { x, y: y - 0.5, z },
        { spawnEvent: variantHatched },
      );

      if (dragon) {
        if (dragon.hasComponent("minecraft:tameable")) {
          const tameable = dragon.getComponent("minecraft:tameable");
          tameable.tame(player);
        }
        if (dragonName === "Unnamed") dragonName = "";
        dragon.nameTag = dragonName;
      }
    }, 60);
  }, 0);

  return true;
}

export function dragonCoreContainerClosed(event) {
  const { block, dimension } = event;
  if (!block || block.typeId !== "dragonmounts2:dragon_core") return;

  const sessionKey = getDragonCoreSessionKey(block);
  const session = dragonCoreContainerSessions.get(sessionKey);
  dragonCoreContainerSessions.delete(sessionKey);
  if (!session) return;

  const container = block.getComponent("inventory")?.container;
  if (!container) return;
  const itemStack = container?.getItem(0);
  if (!itemStack) {
    if (block.permutation.getState(session.params.states.core_used) === true) {
      destroyEmptyDragonCore(block, dimension, session.params);
    } else {
      closeDragonCore(block, dimension, session.params);
    }
    return;
  }

  const player = world.getPlayers().find((candidate) => candidate.id === session.playerId);
  if (session.contested) {
    player?.sendMessage({
      rawtext: [{ text: "§c" }, { translate: "tooltip.dragonmounts2:dragon_core.contested" }],
    });
    return;
  }
  if (
    !player?.isValid ||
    player.dimension.id !== dimension.id ||
    !isPlayerNearCore(player, dimension, block)
  ) {
    closeDragonCore(block, dimension, session.params);
    return;
  }

  if (block.permutation.getState(session.params.states.core_used) === true) {
    closeDragonCore(block, dimension, session.params);
    return;
  }

  const essenceData = itemData.dragonEssenceDataItemTypes[itemStack.typeId];
  const essenceDetails = getDragonEssenceDetails(itemStack);
  if (!essenceData || !essenceDetails) {
    container.setItem(0, undefined);
    returnDragonCoreItem(itemStack, player, dimension, block);
    player.sendMessage({
      rawtext: [{ text: "§c" }, { translate: "tooltip.dragonmounts2:dragon_core.only_essences" }],
    });
    closeDragonCore(block, dimension, session.params);
    return;
  }
  if (essenceDetails.ownerIdentifier !== player.id) {
    container.setItem(0, undefined);
    returnDragonCoreItem(itemStack, player, dimension, block);
    player.sendMessage({
      rawtext: [
        { text: "§c" },
        { translate: "tooltip.dragonmounts2:dragon_not_owned" },
      ],
    });
    closeDragonCore(block, dimension, session.params);
    return;
  }

  if (!hatchDragonCore(block, dimension, player, session.params, itemStack)) {
    return;
  }

  container.setItem(0, undefined);
  if (player.getGameMode() === GameMode.creative) {
    returnDragonCoreItem(itemStack, player, dimension, block);
  }
}

export function dragonCorePlayerInteract(
  block,
  dimension,
  player,
  params,
) {
  if (!player?.isValid || !block) return;
  const dragonCoreBlocks = blockData.dragonCoreBlockTypes;
  if (!dragonCoreBlocks.includes(block.typeId)) return;

  const coreState = block.permutation.getState(params.states.core_state);
  const coreUsed = block.permutation.getState(params.states.core_used);
  if (coreState === "closed") {
    const blockAbove = block.dimension.getBlock(block.above(1));
    if (!blockAbove) return;
    if (!blockAbove.isAir && !blockAbove.isLiquid) {
      player.sendMessage({
        rawtext: [{ text: "§c" }, { translate: "tooltip.dragonmounts2:dragon_core.blocked_above" }],
      });
      return;
    }

    trackDragonCoreContainerUser(block, player, params);
    animateCore(
      block,
      dimension,
      params,
      "opening",
      "random.enderchestopen",
      "block.end_portal.spawn",
      "minecraft:dragon_core_open",
    );
    return;
  }
  if (coreState === "open" && coreUsed !== true) {
    trackDragonCoreContainerUser(block, player, params);
  }
}

export function dragonEggRandomTick(block, dimension, params) {
  dimension.spawnParticle(
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

  setBlockEntityRotation(blockEntity, cardinalDirection);

  dimension.spawnParticle(params.particles.interact_particle, block.center());
}
