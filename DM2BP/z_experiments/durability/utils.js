import { system, LiquidType } from "@minecraft/server"
import { applyDamage } from "../../utils"

export const COMPONENT_ID = "custom:vanilla_durability";

export function onMine(e) {
  const { player, itemStack, block } = e;

  if (
    !player?.isValid ||
    !itemStack ||
    block.liquidSpreadCausesSpawn(LiquidType.Water) ||
    player.getGameMode() === "Creative"
  )
    return;
  if (!itemStack.hasComponent(COMPONENT_ID) || !applyDamage(itemStack)) return;

  const durability = itemStack.getComponent("durability");
  const shouldBreak = durability.damage >= durability.maxDurability;

  const mainhand = player.getComponent("inventory").container;
  const currentSlot = player.selectedSlotIndex;

  system.run(() => {
    if (shouldBreak) {
      mainhand.setItem(currentSlot, undefined);
      player.playSound("random.break");
    } else {
      durability.damage++;
      mainhand.setItem(currentSlot, itemStack);
    }
  });
}

export const onHit = {
  onBeforeDurabilityDamage(e) {
    const { itemStack, attackingEntity } = e;

    if (!attackingEntity?.isValid || !itemStack) return;
    if (
      attackingEntity.typeId === "minecraft:player" &&
      attackingEntity.getGameMode() === "creative"
    ) return;

    e.durabilityDamage = applyDamage(itemStack) ? 1 : 0;
  },
};
