import {
  system,
  EquipmentSlot,
  EntityEquippableComponent,
  ItemCooldownComponent,
  ItemDurabilityComponent,
  ItemEnchantableComponent,
  GameMode,
} from "@minecraft/server";
import { getSoundOptions } from "../../data/settings.js";

export function isShieldItem(itemStack) {
  return itemStack.hasComponent("dragonmounts2:dragon_scale_shield");
}

export function getShieldComponentData(itemStack) {
  if (!isShieldItem(itemStack)) return undefined;
  return itemStack.getComponent("dragonmounts2:dragon_scale_shield");
}

export function getShieldParameters(itemStack) {
  return getShieldComponentData(itemStack)?.customComponentParameters?.params;
}

export function getHeldShield(player, withCooldown = true, cooldownUntilTick = 0) {
  function isValidShield(itemStack) {
    if (!isShieldItem(itemStack)) return false;
    if (withCooldown && cooldownUntilTick > system.currentTick) return false;
    if (withCooldown) {
      const cooldown = itemStack.getComponent(ItemCooldownComponent.componentId);
      if (cooldown && cooldown.getCooldownTicksRemaining(player) > 0) return false;
    }
    return true;
  }

  const equippable = player.getComponent(EntityEquippableComponent.componentId);
  if (!equippable) return undefined;

  const mainhand = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
  const offhand = equippable.getEquipmentSlot(EquipmentSlot.Offhand);
  const mainhandItem = mainhand.getItem();
  const offhandItem = offhand.getItem();

  if (offhandItem?.typeId === "minecraft:shield") return undefined;
  if (offhandItem && isValidShield(offhandItem)) {
    return { item: offhandItem, slot: offhand, hand: "off_hand" };
  }
  if (mainhandItem?.typeId === "minecraft:shield") return undefined;
  if (mainhandItem && isValidShield(mainhandItem)) {
    return { item: mainhandItem, slot: mainhand, hand: "main_hand" };
  }
  return undefined;
}

export function reduceDurability(player, item, damage) {
  if (player.getGameMode() === GameMode.creative) return item;
  const durability = item.getComponent(ItemDurabilityComponent.componentId);
  if (!durability) return item;

  const unbreaking = item
    .getComponent(ItemEnchantableComponent.componentId)
    ?.getEnchantment("unbreaking");
  if (unbreaking !== undefined) {
    const chance = 100 / (unbreaking.level + 1);
    if (Math.random() * 100 < 100 - chance) return item;
  }

  if (durability.damage + damage > durability.maxDurability) {
    player.dimension.playSound("random.break", player.location, getSoundOptions());
    return undefined;
  }

  durability.damage += damage;
  return item;
}
