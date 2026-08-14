import { world, system } from "@minecraft/server";
import * as defaultWorldArrays from "../arrays/default_world_arrays.js";
import * as dragonUtilities from "../utilities/dragon_utilities.js";

system.runInterval(() => {
	for (const dim of defaultWorldArrays.addonDimensions) {
		const dimension = world.getDimension(dim);
		const entities = dimension.getEntities(dragonUtilities.dragonTypes);
		for (const dragon of entities) {
			if (!dragon?.isValid) continue;
			dragonUtilities.dragonsMainComponents(dragon);
		}
	}
	dragonUtilities.tickFallRescue();
}, 5);
