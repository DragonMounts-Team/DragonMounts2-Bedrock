import { world, system } from "@minecraft/server";
import * as defaultWorldArrays from "../arrays/default_world_arrays.js";
import * as dragonUtilities from "../utilities/flight/dragon_utilities.js";
import * as dragonAIUtilities from "../utilities/flight/dragon_ai_utilities.js";

system.runInterval(() => {
	for (const dim of defaultWorldArrays.addonDimensions) {
		try {
			const dimension = world.getDimension(dim);
			const entities = dimension.getEntities(dragonUtilities.dragonTypes);
			for (const dragon of entities) {
				if (!dragon?.isValid) continue;
				try {
					dragonUtilities.dragonsMainComponents(dragon);
					dragonAIUtilities.updateDragonAI(dragon);
				} catch {}
			}
		} catch {}
	}
	try {
		dragonUtilities.tickFallRescue();
		dragonUtilities.tickFlightDebug();
	} catch {}
}, 5);
