import { system } from "@minecraft/server";
import { registerBlockComponents } from "./components/block_components.js";
import { registerItemComponents } from "./components/item_components.js";
import { registerDragonMounts2Commands } from "./modules/command_modules.js";
import { initializePlayerLifecycle } from "./core/player_lifecycle.js";
import { initializeCombatEvents } from "./core/combat_events.js";
import { initializeScriptEvents } from "./core/script_events.js";
import { initializeItemEvents } from "./core/item_events.js";
import { initializeScheduler } from "./core/scheduler.js";
import { initializeWorldEvents } from "./core/world_events.js";
import "./modules/block_modules.js";
import "./modules/entity_modules.js";
import "./modules/dragon_events.js";
import "./modules/item_modules.js";
import "./modules/world_modules.js";
import "./modules/player_modules.js";
import "./modules/settings_modules.js";

initializePlayerLifecycle();
initializeCombatEvents();
initializeScriptEvents();
initializeItemEvents();
initializeScheduler();
initializeWorldEvents();

system.beforeEvents.startup.subscribe(
	({ blockComponentRegistry, customCommandRegistry, itemComponentRegistry }) => {
		registerBlockComponents(blockComponentRegistry);
		registerItemComponents(itemComponentRegistry);
		registerDragonMounts2Commands(customCommandRegistry);
	},
);
