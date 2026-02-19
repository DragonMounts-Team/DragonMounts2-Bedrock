import { world, system, ItemStack } from "@minecraft/server";
import * as defaultWorldArrays from "../arrays/default_world_arrays.js";
import * as itemData from "../data/item_data.js";
import * as itemUtilities from "../utilities/item_utilities.js";

system.beforeEvents.startup.subscribe(({itemComponentRegistry}) => {
	itemComponentRegistry.registerCustomComponent("dragonmounts2:dragon_flute", DragonFlute);
});
const DragonFlute = {
	onHitEntity({attackingEntity,hitEntity,itemStack},{params}) {
		itemUtilities.dragonFluteHitEntity(attackingEntity,hitEntity,itemStack,params);
	},
	onUse({itemStack,source},{params}) {
		itemUtilities.dragonFluteUse(itemStack,source,params);
	}
};