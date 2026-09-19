import { ItemStack } from "@minecraft/server";
import * as blockUtilities from "../utilities/block_utilities.js";
import * as itemData from "../data/item_data.js";
import { getSoundOptions } from "../data/settings.js";
import { onScriptEvent } from "../core/script_events.js";

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

	const dimension = entity.dimension;
	const { x, y, z } = entity.location;
	const blockLocation = dimension.getBlock({
		x: Math.floor(x),
		y: Math.floor(y),
		z: Math.floor(z),
	});
	const spawnLocation = blockLocation.center();
	const cardinalDirection = blockLocation.permutation.getState(
		"minecraft:cardinal_direction",
	);

	dimension.playSound("break.amethyst_block", spawnLocation, getSoundOptions());
	blockLocation.setType("dragonmounts2:dragon_core");
	blockUtilities.restoreCardinalDirection(
		blockLocation,
		"minecraft:cardinal_direction",
		cardinalDirection,
	);

	const essenceItem = new ItemStack(entityEntry.dragon_item, 1);
	essenceItem.setLore([
		{ rawtext: [{ text: `${textColorType}` }, { translate: `${textTranslateType}` }] },
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
	essenceItem.setDynamicProperty("dragonmounts2:owner_identifier", ownerIdentifier);
	essenceItem.setDynamicProperty("dragonmounts2:variant_type", variantProperty);
	essenceItem.setDynamicProperty("dragonmounts2:dragon_name", dragonName);
	essenceItem.setDynamicProperty(
		"dragonmounts2:dragon_identifier",
		dragonIdentifier,
	);

	dimension.spawnItem(essenceItem, {
		x: spawnLocation.x,
		y: spawnLocation.y + 0.5,
		z: spawnLocation.z,
	});
});
