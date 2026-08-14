import { world } from "@minecraft/server";
import { registerCustomComponent } from "../../register";
import * as data from "./utils"

registerCustomComponent(data.COMPONENT_ID, data.onHit);

world.beforeEvents.playerBreakBlock.subscribe(data.onMine);