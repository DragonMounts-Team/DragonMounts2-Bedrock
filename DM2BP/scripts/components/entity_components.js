import { world, system } from "@minecraft/server";
import * as defaultWorldArrays from "../arrays/default_world_arrays.js";

system.runInterval(() => {
	for (const dim of defaultWorldArrays.addonDimensions) {
		const dimension = world.getDimension(dim);
		const entities = dimension.getEntities({type:"dragonmounts2:fire_dragon_egg"});
		for (const dragonEgg of entities) {
			const loc = dragonEgg.location;
			const blockBelow = dimension.getBlock({x:Math.floor(loc.x),y:Math.floor(loc.y-1),z:Math.floor(loc.z)});
			const eggNestingBlock = dragonEgg.getProperty("dragonmounts2:egg_nesting_block");
			// ⛔ Chunk unloaded → block is undefined
			if (!blockBelow) {
				continue;
			}
			if (blockBelow.typeId=="minecraft:magma"||blockBelow.typeId=="minecraft:bedrock") {
				dragonEgg.setProperty("dragonmounts2:egg_nesting_block",true);
			} 
			else if (blockBelow) {
				dragonEgg.setProperty("dragonmounts2:egg_nesting_block",false);
			}
		}
	}
},0);

world.afterEvents.dataDrivenEntityTrigger.subscribe(({entity,eventId}) => {
	if (!entity.isValid) return;
	if (entity.typeId!="dragonmounts2:fire_dragon_egg") return;
	const centerBlock = entity.dimension.getBlock(entity.location);
	if (eventId=="minecraft:dragon_egg_to_block") {
		centerBlock.setType(entity.typeId);
		entity.triggerEvent("minecraft:dragon_egg_despawn");
	}
});