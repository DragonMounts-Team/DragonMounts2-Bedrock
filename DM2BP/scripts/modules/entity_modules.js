import { system, Player } from "@minecraft/server";
import * as entityData from "../data/entity_data.js";
import * as entityUtilities from "../utilities/entity_utilities.js";
import * as itemUtilities from "../utilities/item_utilities.js";
import * as blockUtilities from "../utilities/block_utilities.js";
import { restoreOwnedDragonFlightState } from "../utilities/dragon_utilities.js";
import { getAddonDimensions } from "../lib/runtime.js";
import { onPlayerLeave, onPlayerSpawn } from "../core/player_lifecycle.js";
import { onScriptEvent } from "../core/script_events.js";
import { onItemStartUse } from "../core/item_events.js";
import { registerIntervalTask } from "../core/scheduler.js";
import { onWorldEvent } from "../core/world_events.js";
import "./dragon_modules.js";

function checkDragonEggs() {
	try {
		for (const dimension of getAddonDimensions()) {
			const dragonEggs = dimension.getEntities({
				families: ["dragonmounts2", "dragon_egg"],
			});
			for (const dragonEgg of dragonEggs) {
				if (!dragonEgg.isValid) continue;
				try {
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

onItemStartUse(({ itemStack, source }) => {
	if (!(source instanceof Player) || !source.isValid) return;
	if (itemStack?.typeId !== "dragonmounts2:guide_book") return;
	itemUtilities.guideBookUse(itemStack, source, {});
});

onPlayerSpawn(({ player, initialSpawn }) => {
	if (!(player instanceof Player) || !player.isValid || !initialSpawn) return;
	if (
		player.getDynamicProperty("dragonmounts2:guide_book_original_mode") !==
		"creative"
	)
		return;

	const bookId = player.getDynamicProperty(
		"dragonmounts2:guide_book_entity_id",
	);
	if (bookId) {
		for (const dimension of getAddonDimensions()) {
			const book = dimension
				.getEntities({ type: "dragonmounts2:guide_book" })
				.find((candidate) => candidate.id === bookId);
			book?.remove();
		}
	}
	itemUtilities.restoreGuideBookMode(player);
});

onPlayerLeave(({ playerId }) => {
	for (const dimension of getAddonDimensions()) {
		for (const book of dimension.getEntities({
			type: "dragonmounts2:guide_book",
		})) {
			if (book.getDynamicProperty("dragonmounts2:book_user_id") === playerId)
				book.remove();
		}
	}
});

onScriptEvent((event) => {
	const entity = event.sourceEntity;
	if (!entity?.isValid) return;

	if (event.id === "dragonmounts2:guide_book_try_open") {
		if (entity instanceof Player)
			entity.setDynamicProperty("dragonmounts2:guide_book_open", true);
		return;
	}

	if (event.id === "dragonmounts2:guide_book_try_close") {
		if (entity instanceof Player) {
			const bookEntityId = entity.getDynamicProperty(
				"dragonmounts2:guide_book_entity_id",
			);
			if (bookEntityId) {
				const bookEntity = entity.dimension
					.getEntities({ type: "dragonmounts2:guide_book" })
					.find((candidate) => candidate.id === bookEntityId);
				bookEntity?.remove();
			}
			entity.setDynamicProperty("dragonmounts2:guide_book_entity_id", "");
			itemUtilities.restoreGuideBookMode(entity);
		}
		return;
	}

	if (event.id === "dragonmounts2:set_guide_book") {
		const validStates = [
			"home", "page_1_1", "page_1_2", "page_1_3", "page_1_4", "page_1_5",
			"page_2_1", "page_2_2", "page_2_3", "page_2_4", "page_2_5",
			"page_3_1", "page_3_2", "page_3_3", "page_3_4", "page_3_5",
			"page_4_1", "page_4_2", "page_4_3", "page_4_4", "page_4_5",
			"page_5_1", "page_5_2", "page_5_3", "page_5_4", "page_5_5",
			"page_6_1", "page_6_2", "page_6_3", "page_6_4", "page_6_5",
		];
		const index = validStates.indexOf(event.message);
		if (index < 0) return;
		entity.setProperty("dragonmounts2:page_number", index === 0 ? 0 : index);
	}
});

onWorldEvent("afterEvents", "dataDrivenEntityTrigger", ({ entity, eventId }) => {
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
});
