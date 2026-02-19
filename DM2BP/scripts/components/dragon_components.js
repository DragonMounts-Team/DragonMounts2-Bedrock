import { world, system } from "@minecraft/server";
import * as defaultWorldArrays from "../arrays/default_world_arrays.js";
import * as dragonUtilities from "../utilities/dragon_utilities.js";

system.runInterval(() => {
	for (const dim of defaultWorldArrays.addonDimensions) {
		const entities = world.getDimension(dim).getEntities(dragonUtilities.dragonTypes);
		for (const dragon of entities) {
			dragonUtilities.dragonsMainComponents(dragon);
		}
	}
},0);