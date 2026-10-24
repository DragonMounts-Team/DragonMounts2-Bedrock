import * as blockUtilities from "../utilities/block_utilities.js";
import * as itemData from "../data/item_data.js";
import { getSoundOptions } from "../data/settings.js";
import { onScriptEvent } from "../core/script_events.js";
import { onWorldEvent } from "../core/world_events.js";
import { registerIntervalTask } from "../core/scheduler.js";

// true: a dead tamed dragon leaves a Dragon Core block on the floor with its
// essence inside (Java DM2). false: the bare essence gem is dropped instead.
// If no core can be placed, the essence gem is dropped as a fallback.
const SPAWN_CORE_ON_DEATH = true;

onWorldEvent("afterEvents", "playerBreakBlock", blockUtilities.dragonCoreBroken);
onWorldEvent("afterEvents", "blockExplode", blockUtilities.dragonCoreBroken);
onWorldEvent("afterEvents", "entityHitEntity", blockUtilities.dragonCoreContainerHit);
onWorldEvent("afterEvents", "entityContainerOpened", blockUtilities.dragonCoreContainerOpened);
onWorldEvent("afterEvents", "entityContainerClosed", blockUtilities.dragonCoreContainerClosed);
registerIntervalTask("dragon_core_containers", 4, blockUtilities.tickDragonCores);

onScriptEvent((event) => {
  const entity = event.sourceEntity;
  if (!entity?.isValid) return;

  if (event.id === "dragonmounts2:dragon_death_ticks") {
    const deathTicks = entity.getProperty("dragonmounts2:death_ticks");
    entity.runCommand(`title @p actionbar ${deathTicks}`);
    return;
  }

  if (event.id !== "dragonmounts2:dragon_core") return;
  const entityEntry = itemData.dragonEssenceDataEntityTypes[entity.typeId];
  if (!entityEntry?.dragon_item) return;

  const tameable = entity.getComponent("minecraft:tameable");
  const ownerName =
    entity.getDynamicProperty("dragonmounts2:owner_name") ??
    (tameable?.tamedToPlayer ? tameable.tamedToPlayer.name : "Unknown");
  const ownerIdentifier =
    entity.getDynamicProperty("dragonmounts2:owner_identifier") ??
    tameable?.tamedToPlayerId ??
    "";
  const dragonIdentifier =
    entity.getDynamicProperty("dragonmounts2:dragon_identifier") ?? entity.id;
  const dragonName = entity.nameTag?.trim() || "Unnamed";
  const variantProperty = entity.getProperty(
    entityEntry.dragon_data.variant_property,
  );
  const {
    text_translate_type: textTranslateType,
    text_color_type: textColorType,
  } = entityEntry.dragon_data;

  const essenceData = {
    dragon_item: entityEntry.dragon_item,
    ownerName,
    ownerIdentifier,
    variantType: variantProperty,
    dragonName,
    dragonIdentifier,
    textTranslateType,
    textColorType,
  };

  const location = {
    x: entity.location.x,
    y: entity.location.y + 0.3,
    z: entity.location.z,
  };

  if (
    SPAWN_CORE_ON_DEATH &&
    blockUtilities.spawnDragonCoreWithEssence(
      entity.dimension,
      entity.location,
      essenceData,
    )
  ) {
    return;
  }

  try {
    entity.dimension.spawnItem(blockUtilities.createDragonEssenceItem(essenceData), location);
    entity.dimension.playSound(
      "break.amethyst_block",
      location,
      getSoundOptions(),
    );
  } catch (error) {
    console.error(`[DragonMounts2] Dragon essence drop failed: ${error?.message ?? error}`);
  }
});
