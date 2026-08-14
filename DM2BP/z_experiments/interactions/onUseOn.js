import { system, world } from "@minecraft/server";
import { applyDamage } from "../../utils";
import { registerCustomComponent } from "../../register";

const COMPONENT_ID = "custom:use_on";
registerCustomComponent(COMPONENT_ID, { onUseOn() { } });

const soundCooldown = new Map();

const TOOL_CONFIG = {
    "minecraft:is_shovel": {
        blockTypes: ["minecraft:grass_block"],
        invalidFace: "Down",
        sound: "use.grass",
    },
    "minecraft:is_hoe": {
        blockTypes: [
            "minecraft:grass_block",
            "minecraft:dirt",
            "minecraft:grass_path",
        ],
        invalidFace: "Down",
        sound: "use.gravel",
    },
    "minecraft:is_axe": {
        customCheck: (id) =>
            (id.endsWith("_log") || id.endsWith("_stem")) &&
            id.startsWith("minecraft:") &&
            !id.includes("stripped_"),
        sound: "use.wood",
    },
};

world.beforeEvents.playerInteractWithBlock.subscribe((e) => {
    const { player, itemStack, block, blockFace } = e;
    if (!player?.isValid || !itemStack) return;

    const toolTag = itemStack.getTags().find((tag) => TOOL_CONFIG[tag]);
    if (!toolTag) return;

    if (!itemStack.hasComponent(COMPONENT_ID)) {
        e.cancel = itemStack.hasComponent('custom:on_use') || itemStack.typeId.includes("enderian");
        return;
    }

    const { blockTypes, invalidFace, customCheck, sound } = TOOL_CONFIG[toolTag];
    const blockId = block.typeId;

    if (blockTypes && !blockTypes.includes(blockId)) return;
    if (invalidFace && invalidFace === blockFace) return;
    if (customCheck && !customCheck(blockId)) return;

    const lastSoundTick = soundCooldown.get(player.id) || 0;
    if (system.currentTick - lastSoundTick >= 4) {
        system.run(() =>
            block.dimension.playSound(sound, block.location, {
                volume: 0.8,
                pitch: 0.8,
            }),
        );
        soundCooldown.set(player.id, system.currentTick);
    }

    if (
        player.getGameMode() === "Creative" ||
        !itemStack.hasComponent(COMPONENT_ID)
    )
        return;

    if (!applyDamage(itemStack)) return;

    const { damage, maxDurability } = itemStack.getComponent("durability");
    const inventory = player.getComponent("inventory").container;
    const slot = player.selectedSlotIndex;

    system.run(() => {
        if (damage >= maxDurability) {
            inventory.setItem(slot, undefined);
            player.playSound("random.break");
        } else {
            itemStack.getComponent("durability").damage++;
            inventory.setItem(slot, itemStack);
        }
    });

});
