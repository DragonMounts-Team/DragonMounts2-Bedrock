import { world, system, ItemStack } from "@minecraft/server";
import * as defaultWorldArrays from "../arrays/default_world_arrays.js";
import * as blockData from "../data/block_data.js";
import * as blockUtilities from "../utilities/block_utilities.js";
import * as itemData from "../data/item_data.js";

system.afterEvents.scriptEventReceive.subscribe(event => {
	const entity = event.sourceEntity;
	if (!entity?.isValid) return;

	if (event.id === "dragonmounts2:dragon_death_ticks") {
		const deathTicks = entity.getProperty("dragonmounts2:death_ticks");
		entity.runCommand(`title @p actionbar ${deathTicks}`);
		return;
	}

	if (event.id === "dragonmounts2:dragon_core") {
		const essenceEntityData = itemData.dragonEssenceDataEntityTypes;
		const entityEntry = essenceEntityData[entity.typeId];
		if (!entityEntry?.dragon_item) return;

		const tameable = entity.getComponent("minecraft:tameable");
		const ownerName = entity.getDynamicProperty("dragonmounts2:owner_name")
			?? (tameable?.tamedToPlayer ? tameable.tamedToPlayer.name : "Unknown");
		const ownerIdentifier = entity.getDynamicProperty("dragonmounts2:owner_identifier")
			?? (tameable?.tamedToPlayerId ?? "");
		const dragonIdentifier = entity.getDynamicProperty("dragonmounts2:dragon_identifier") ?? entity.id;

		let dragonName = entity.nameTag;
		if (!dragonName || dragonName.trim() === "") dragonName = "Unnamed";

		const variantProperty = entity.getProperty(entityEntry.dragon_data.variant_property);
		const { text_translate_type: textTranslateType, text_color_type: textColorType } = entityEntry.dragon_data;

		const dimension = entity.dimension;
		const { x, y, z } = entity.location;
		const blockLocation = dimension.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
		const spawnLocation = blockLocation.center();

		dimension.playSound("break.amethyst_block", spawnLocation);
		blockLocation.setType("dragonmounts2:dragon_core");

		const essenceItem = new ItemStack(entityEntry.dragon_item, 1);
		essenceItem.setLore([
			{ rawtext: [{ text: `${textColorType}` }, { translate: `${textTranslateType}` }] },
			{ rawtext: [{ text: "§r§7" }, { translate: "tooltip.dragonmounts2:dragon_owner_name" }, { text: ":" }] },
			`§r§9 ${ownerName}`,
			`§r§8 ${ownerIdentifier}`,
			{ rawtext: [{ text: "§r§7" }, { translate: "tooltip.dragonmounts2:dragon_variant_type" }, { text: ":" }] },
			`§r§9 ${variantProperty}`,
			{ rawtext: [{ text: "§r§7" }, { translate: "tooltip.dragonmounts2:dragon_name" }, { text: ":" }] },
			`§r§9 ${dragonName}`,
			`§r§8 ${dragonIdentifier}`
		]);
		essenceItem.setDynamicProperty("dragonmounts2:owner_identifier", ownerIdentifier);
		essenceItem.setDynamicProperty("dragonmounts2:variant_type", variantProperty);
		essenceItem.setDynamicProperty("dragonmounts2:dragon_name", dragonName);
		essenceItem.setDynamicProperty("dragonmounts2:dragon_identifier", dragonIdentifier);

		dimension.spawnItem(essenceItem, { x: spawnLocation.x, y: spawnLocation.y + 0.5, z: spawnLocation.z });
	}
});

system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
	blockComponentRegistry.registerCustomComponent("dragonmounts2:dragon_core", DragonCore);
	blockComponentRegistry.registerCustomComponent("dragonmounts2:dragon_egg", DragonEgg);
});

const DragonCore = {
	onPlayerInteract({ block, dimension, player }, { params }) {
		blockUtilities.dragonCorePlayerInteract(block, dimension, player, params);
	}
};

const DragonEgg = {
	onPlayerInteract({ block, dimension, player }, { params }) {
		blockUtilities.dragonEggPlayerInteract(block, dimension, player, params);
	},
	onRandomTick({ block, dimension }, { params }) {
		blockUtilities.dragonEggRandomTick(block, dimension, params);
	}
};