import { world, system, LiquidType } from "@minecraft/server";
import { registerCustomComponent } from "../../register"
import { getMainHandData } from "../../utils"

const COMPONENT_ID = "custom:on_mine"
registerCustomComponent(COMPONENT_ID);

world.beforeEvents.playerBreakBlock.subscribe((e) => {
    const { block, itemStack, player } = e;

    if (block.liquidSpreadCausesSpawn(LiquidType.Water)) return;
    if (!player?.isValid || !itemStack) return;

    const itemData = getMainHandData(player, COMPONENT_ID);
    if (!itemData) return

    const { trigger = null } = itemData;
    if (!trigger) return;

    system.run(() => components.onMine[trigger](e));
})
