import { system, EquipmentSlot, Player, world } from "@minecraft/server";
import * as entityData from "../data/entity_data.js";
import * as entityUtilities from "../utilities/entity_utilities.js";
import * as itemUtilities from "../utilities/item_utilities.js";
import * as blockUtilities from "../utilities/block_utilities.js";
import {
  cycleRiderAttackMode,
  restoreOwnedDragonFlightState,
} from "../utilities/dragon_utilities.js";
import { getAddonDimensions } from "../lib/runtime.js";
import { onPlayerSpawn } from "../core/player_lifecycle.js";
import { registerIntervalTask } from "../core/scheduler.js";
import { onWorldEvent } from "../core/world_events.js";
import * as settings from "../data/settings.js";
import "./dragon_modules.js";

function toggleMountedDragonAttackMode(player, dragon) {
  if (!(player instanceof Player) || !player.isValid) return false;
  return cycleRiderAttackMode(dragon, player);
}

function hasEmptyMainhand(player) {
  const slot = player
    .getComponent("minecraft:equippable")
    ?.getEquipmentSlot(EquipmentSlot.Mainhand);
  const item = slot?.getItem();
  return !item || item.typeId === "minecraft:air";
}

function handleMountedDragonAttackModeInteract(event) {
  const { player } = event;
  if (!(player instanceof Player) || !player.isValid) return;
  const dragon = player
    ?.getComponent("minecraft:riding")
    ?.entityRidingOn;
  if (
    !hasEmptyMainhand(player) ||
    !dragon ||
    !entityData.dragonTypeIds.has(dragon.typeId)
  ) return;
  if (toggleMountedDragonAttackMode(player, dragon)) event.cancel = true;
}

function checkDragonEggs() {
  try {
    const hatchSpeed = settings.getWorldDragonEggHatchSpeed();
    for (const dimension of getAddonDimensions()) {
      const dragonEggs = dimension.getEntities({
        families: ["dragonmounts2", "dragon_egg"],
      });
      for (const dragonEgg of dragonEggs) {
        if (!dragonEgg.isValid) continue;
        try {
          if (dragonEgg.getProperty("dragonmounts2:egg_hatch_speed") !== hatchSpeed) {
            dragonEgg.setProperty("dragonmounts2:egg_hatch_speed", hatchSpeed);
          }
          entityUtilities.getDragonEggNestingBlock(dragonEgg);
          entityUtilities.getDragonEggConvertBlock(dragonEgg);
        } catch (error) {
          console.warn(`[DragonMounts2] Dragon egg update failed: ${error}`);
        }
      }
    }
  } catch (error) {
    console.warn(`[DragonMounts2] Dragon egg scan failed: ${error}`);
  }
}

registerIntervalTask("dragon-egg-scan", 10, checkDragonEggs);

onPlayerSpawn(({ player }) => {
  if (!player?.isValid) return;
  system.run(() => restoreOwnedDragonFlightState(player));
});

onWorldEvent("beforeEvents", "playerInteractWithEntity", (event) => {
  handleMountedDragonAttackModeInteract(event);
});

onWorldEvent("beforeEvents", "playerInteractWithBlock", (event) => {
  handleMountedDragonAttackModeInteract(event);
});

onWorldEvent(
  "afterEvents",
  "dataDrivenEntityTrigger",
  ({ entity, eventId }) => {
    if (!entity?.isValid) return;
    if (!entityData.dragonEggTypes[entity.typeId]) return;
    if (eventId !== "minecraft:dragon_egg_to_block") return;

    const centerBlock = entity.dimension.getBlock(entity.location);
    if (!centerBlock || (!centerBlock.isAir && !centerBlock.isLiquid)) return;

    const cardinalDirection = blockUtilities.getCardinalDirectionFromRotation(
      entity.getRotation().y,
    );
    centerBlock.setType(entity.typeId);
    blockUtilities.restoreCardinalDirection(
      centerBlock,
      "minecraft:cardinal_direction",
      cardinalDirection,
    );
    entity.triggerEvent("minecraft:dragon_egg_despawn");
  },
);
