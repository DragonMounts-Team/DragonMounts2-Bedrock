import { world, system, Player, GameMode } from "@minecraft/server";
import * as defaultWorldArrays from "../arrays/default_world_arrays.js";
import * as entityData from "../data/entity_data.js";
import * as entityUtilities from "../utilities/entity_utilities.js";
import * as itemUtilities from "../utilities/item_utilities.js";

const EGG_CHECK_INTERVAL = 10;

function checkDragonEggs() {
	for (const dim of defaultWorldArrays.addonDimensions) {
		const dimension = world.getDimension(dim);
		const dragonEggs = dimension.getEntities({ families: ["dragonmounts2", "dragon_egg"] });
		for (const dragonEgg of dragonEggs) {
			if (!dragonEgg.isValid) continue;
			entityUtilities.getDragonEggNestingBlock(dragonEgg);
			entityUtilities.getDragonEggConvertBlock(dragonEgg);
		}
	}
	system.runTimeout(checkDragonEggs, EGG_CHECK_INTERVAL);
}

system.run(checkDragonEggs);

world.afterEvents.itemStartUse.subscribe(({ itemStack, source }) => {
	if (!(source instanceof Player) || !source.isValid) return;
	if (itemStack?.typeId !== "dragonmounts2:guide_book") return;
	itemUtilities.guideBookUse(itemStack, source, {});
});

system.afterEvents.scriptEventReceive.subscribe((event) => {
	const entity = event.sourceEntity;
	if (!entity?.isValid) return;

	if (event.id === "dragonmounts2:guide_book_try_open") {
		if (entity instanceof Player) {
			entity.setDynamicProperty("dragonmounts2:guide_book_open", true);
		}
		return;
	}

	if (event.id === "dragonmounts2:guide_book_try_close") {
		if (entity instanceof Player) {
			const bookEntityId = entity.getDynamicProperty("dragonmounts2:guide_book_entity_id");
			if (bookEntityId) {
				const bookEntity = entity.dimension.getEntities({ type: "dragonmounts2:guide_book" }).find((candidate) => candidate.id === bookEntityId);
				bookEntity?.remove();
			}
			entity.setDynamicProperty("dragonmounts2:guide_book_entity_id", "");
			entity.setDynamicProperty("dragonmounts2:guide_book_open", false);
			itemUtilities.restoreGuideBookMode(entity);
		}
		return;
	}

	if (event.id === "dragonmounts2:set_guide_book") {
		const message = event.message;
		const validStates = [
			"home",
			"page_1_1",
			"page_1_2",
			"page_1_3",
			"page_1_4",
			"page_1_5",
			"page_2_1",
			"page_2_2",
			"page_2_3",
			"page_2_4",
			"page_2_5",
			"page_3_1",
			"page_3_2",
			"page_3_3",
			"page_3_4",
			"page_3_5",
			"page_4_1",
			"page_4_2",
			"page_4_3",
			"page_4_4",
			"page_4_5",
			"page_5_1",
			"page_5_2",
			"page_5_3",
			"page_5_4",
			"page_5_5",
			"page_6_1",
			"page_6_2",
			"page_6_3",
			"page_6_4",
			"page_6_5"
		];
		const index = validStates.indexOf(message);
		if (index < 0) return;
		entity.setProperty("dragonmounts2:page_number", index === 0 ? 0 : index);
	}
});

world.afterEvents.dataDrivenEntityTrigger.subscribe(({ entity, eventId }) => {
	if (!entity?.isValid) return;
	if (!entityData.dragonEggTypes[entity.typeId]) return;
	if (eventId !== "minecraft:dragon_egg_to_block") return;

	const centerBlock = entity.dimension.getBlock(entity.location);
	if (!centerBlock || (!centerBlock.isAir && !centerBlock.isLiquid)) return;

	centerBlock.setType(entity.typeId);
	entity.triggerEvent("minecraft:dragon_egg_despawn");
});
