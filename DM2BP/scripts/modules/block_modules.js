import { ItemStack } from "@minecraft/server";
import * as blockUtilities from "../utilities/block_utilities.js";
import * as itemData from "../data/item_data.js";
import { getSoundOptions } from "../data/settings.js";
import { onScriptEvent } from "../core/script_events.js";
import { onWorldEvent } from "../core/world_events.js";

onWorldEvent(
  "afterEvents",
  "blockContainerClosed",
  blockUtilities.dragonCoreContainerClosed,
);

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

  const essenceItem = new ItemStack(entityEntry.dragon_item, 1);
  essenceItem.setLore([
    {
      rawtext: [
        { text: `${textColorType}` },
        { translate: `${textTranslateType}` },
      ],
    },
    {
      rawtext: [
        { text: "§r§7" },
        { translate: "tooltip.dragonmounts2:dragon_owner_name" },
        { text: ":" },
      ],
    },
    `§r§9 ${ownerName}`,
    `§r§8 ${ownerIdentifier}`,
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
        { translate: "tooltip.dragonmounts2:dragon_name" },
        { text: ":" },
      ],
    },
    `§r§9 ${dragonName}`,
    `§r§8 ${dragonIdentifier}`,
  ]);
  essenceItem.setDynamicProperty(
    "dragonmounts2:owner_identifier",
    ownerIdentifier,
  );
  essenceItem.setDynamicProperty("dragonmounts2:variant_type", variantProperty);
  essenceItem.setDynamicProperty("dragonmounts2:dragon_name", dragonName);
  essenceItem.setDynamicProperty(
    "dragonmounts2:dragon_identifier",
    dragonIdentifier,
  );
  const location = {
    x: entity.location.x,
    y: entity.location.y + 0.3,
    z: entity.location.z,
  };
  try {
    entity.dimension.spawnItem(essenceItem, location);
    entity.dimension.playSound(
      "break.amethyst_block",
      location,
      getSoundOptions(),
    );
  } catch (error) {
    console.error(`[DragonMounts2] Dragon essence drop failed: ${error?.message ?? error}`);
  }
});
