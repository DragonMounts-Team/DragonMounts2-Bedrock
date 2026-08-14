import "../components/item_components.js";
import { world, system, ButtonState, EntityDamageCause, EntityOnFireComponent, InputButton, EquipmentSlot, EntityEquippableComponent, ItemCooldownComponent, ItemDurabilityComponent, ItemEnchantableComponent, Player } from "@minecraft/server";
import * as itemUtilities from "../utilities/item_utilities.js";

const Shields = {};

const delays = {};
const usingItem = {};
const cooldownUntil = {};
const recentlyBlocked = {};
const playerAnimations = {};
const cancelledEffects = {};

function getHeldShield(player, withCooldown = true) {
  function isValidShield(item2) {
    if (!item2.hasComponent("dragonmounts2:dragon_scale_shield")) return false;
    if (withCooldown && (cooldownUntil[player.id] ?? 0) > system.currentTick) return false;
    return true;
  }
  const equippable = player.getComponent(EntityEquippableComponent.componentId);
  if (!equippable) return undefined;
  const offhand = equippable.getEquipmentSlot(EquipmentSlot.Offhand);
  const offItem = offhand.getItem();
  if (offItem && isValidShield(offItem)) return { item: offItem, slot: offhand, hand: "off_hand" };
  const mainhand = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
  const item = mainhand.getItem();
  if (item && isValidShield(item)) return { item, slot: mainhand, hand: "main_hand" };
  return undefined;
}

function runDelay(player, delay) {
  if (delays[player.id]) system.clearRun(delays[player.id]);
  const playerId = player.id;
  const id = system.runTimeout(() => {
    delete delays[playerId];
  }, delay * 20);
  delays[playerId] = id;
}

function stopBlockAnimation(player) {
  const anim = playerAnimations[player.id];
  if (anim) {
    player.playAnimation(anim, { blendOutTime: 0, stopExpression: "return true;" });
    delete playerAnimations[player.id];
  }
}

function startBlockAnimation(player, hand) {
  const animName = `animation.dragonmounts2.player.shield_block_${hand}`;
  if (playerAnimations[player.id] !== animName) {
    stopBlockAnimation(player);
    player.playAnimation(animName, { blendOutTime: 99999, stopExpression: "q.is_sneaking" });
    playerAnimations[player.id] = animName;
  }
}

world.afterEvents.playerButtonInput.subscribe((data) => {
  if (data.button !== InputButton.Sneak) return;
  const player = data.player;
  if (data.newButtonState === ButtonState.Pressed) {
    const shield = getHeldShield(player);
    const delay = shield?.item.getComponent("dragonmounts2:dragon_scale_shield")?.customComponentParameters?.params?.delay;
    if (delay !== undefined) runDelay(player, delay);
    if (shield && !usingItem[player.id]) {
      startBlockAnimation(player, shield.hand);
    }
  } else {
    stopBlockAnimation(player);
    if (delays[player.id]) system.clearRun(delays[player.id]);
    delete delays[player.id];
  }
});

world.afterEvents.playerSwingStart.subscribe((data) => {
  if (!data.player.isSneaking) return;
  const player = data.player;
  const shield = getHeldShield(player);
  const delay = shield?.item.getComponent("dragonmounts2:dragon_scale_shield")?.customComponentParameters?.params?.delay;
  if (delay !== undefined) {
    runDelay(player, delay);
  }
});

world.afterEvents.playerHotbarSelectedSlotChange.subscribe((data) => {
  const player = data.player;
  if (!playerAnimations[player.id]) return;
  if (!getHeldShield(player, false)) stopBlockAnimation(player);
});

world.beforeEvents.entityHurt.subscribe((data) => {
  if (!(data.hurtEntity instanceof Player)) return;
  const player = data.hurtEntity;
  const cause = data.damageSource.cause;
  const currentTick = system.currentTick;

  // Brief grace period after a successful block so lingering fire-tick damage
  // (e.g. from standing in fire/lava right as you blocked) doesn't slip through.
  if (cause === EntityDamageCause.fireTick || cause === EntityDamageCause.fire || cause === EntityDamageCause.onFire) {
    if (recentlyBlocked[player.id] !== undefined && currentTick - recentlyBlocked[player.id] < 40) {
      data.cancel = true;
    }
    return;
  }

  let preDamageValue = data.damage;
  const equip = player.getComponent(EntityEquippableComponent.componentId);
  if (equip) {
    let totalProtection = 0;
    // totalArmor comes straight from the engine (sum of each equipped item's
    // "minecraft:armor" component), so custom/modded armor is picked up
    // automatically - no hardcoded item lookup table needed.
    const totalArmor = equip.totalArmor ?? 0;
    for (const equipSlot in EquipmentSlot) {
      if (equipSlot.includes("hand")) continue;
      const slot = equip.getEquipmentSlot(EquipmentSlot[equipSlot]);
      const item = slot.getItem();
      if (item) {
        const ench = item.getComponent(ItemEnchantableComponent.componentId);
        const prot = ench?.getEnchantment("protection");
        const proj = ench?.getEnchantment("projectile_protection");
        if (prot) totalProtection += prot.level;
        if (proj && cause === EntityDamageCause.projectile) totalProtection += proj.level;
      }
    }
    if (totalArmor) preDamageValue = preDamageValue / (1 - totalArmor * 0.03875);
    if (totalProtection) preDamageValue = preDamageValue / (1 - totalProtection * 0.03875);
  }

  if (!player.isSneaking || delays[player.id] !== undefined || usingItem[player.id]) return;
  const shield = getHeldShield(player);
  if (!shield) return;

  const playerLoc = player.location;
  const viewDir = player.getViewDirection();
  const viewDirLoc = {
    x: playerLoc.x + viewDir.x * 0.01,
    y: playerLoc.y,
    z: playerLoc.z + viewDir.z * 0.01
  };
  const damageLocation = data.damageSource.damagingEntity?.location ?? data.damageSource.damagingProjectile?.location;
  if (!damageLocation) return;
  const pTotal = Math.abs(playerLoc.x - damageLocation.x) + Math.abs(playerLoc.y - damageLocation.y) + Math.abs(playerLoc.z - damageLocation.z);
  const vTotal = Math.abs(viewDirLoc.x - damageLocation.x) + Math.abs(viewDirLoc.y - damageLocation.y) + Math.abs(viewDirLoc.z - damageLocation.z);
  if (pTotal < vTotal) return;

  let disableShield = false;
  if (data.damageSource.damagingEntity) {
    const disableConditions = [
      data.damageSource.damagingEntity.typeId === "minecraft:vindicator",
      data.damageSource.damagingEntity.typeId === "minecraft:piglin_brute",
      data.damageSource.damagingEntity.typeId === "minecraft:warden" && cause === EntityDamageCause.entityAttack
    ];
    if (disableConditions.some((f) => f === true)) {
      disableShield = true;
    } else {
      const equippable = data.damageSource.damagingEntity.getComponent(EntityEquippableComponent.componentId);
      if (equippable?.getEquipmentSlot(EquipmentSlot.Mainhand).getItem()?.hasTag("minecraft:is_axe")) disableShield = true;
    }
  }

  const hadFire = player.getComponent(EntityOnFireComponent.componentId) !== undefined;
  cancelledEffects[player.id] = true;
  recentlyBlocked[player.id] = currentTick;
  const id = player.id;

  system.run(() => {
    delete cancelledEffects[id];
    const heldShield = getHeldShield(player);
    if (!heldShield) return;
    if (data.damageSource.damagingEntity?.typeId === "minecraft:ravager" && cause === EntityDamageCause.entityAttack) data.damageSource.damagingEntity.triggerEvent("minecraft:become_stunned");
    if (!hadFire && player.getComponent(EntityOnFireComponent.componentId)) player.extinguishFire();
    if (Shields[heldShield.item.typeId]) Shields[heldShield.item.typeId]({ event: data, item: heldShield.item, source: player, slot: heldShield.slot });
    if (heldShield.item.hasComponent(ItemDurabilityComponent.componentId)) {
      let damage = preDamageValue;
      if (damage > Math.floor(damage)) damage = Math.floor(damage);
      damage += 1;
      heldShield.slot.setItem(itemUtilities.reduceDurability(player, heldShield.item, damage));
    }
    const comp = heldShield.item.getComponent("dragonmounts2:dragon_scale_shield")?.customComponentParameters.params;
    if (comp.knockback && data.damageSource.damagingEntity && !data.damageSource.damagingProjectile) {
      const total = Math.abs(damageLocation.x - playerLoc.x) + Math.abs(damageLocation.z - playerLoc.z);
      try {
        data.damageSource.damagingEntity.applyKnockback({ x: (damageLocation.x - playerLoc.x) / total * (comp.knockback.x ?? 0), z: (damageLocation.z - playerLoc.z) / total * (comp.knockback.x ?? 0) }, comp.knockback.y ?? 0.1);
      } catch {
      }
    }
    const cooldown = heldShield.item.getComponent(ItemCooldownComponent.componentId);
    if (comp.block) player.dimension.playSound(comp.block, player.location);
    if (comp.command) player.runCommand(comp.command);
    if (cooldown !== undefined && disableShield) {
      cooldown.startCooldown(player);
      cooldownUntil[id] = system.currentTick + (cooldown.cooldownTicks ?? 100);
      if (comp.disable_sound) player.dimension.playSound(comp.disable_sound, player.location);
    }
  });
  data.cancel = true;
});

world.beforeEvents.effectAdd.subscribe((data) => {
  if (!cancelledEffects[data.entity.id]) return;
  data.cancel = true;
});

world.afterEvents.playerLeave.subscribe((data) => {
  delete playerAnimations[data.playerId];
  delete usingItem[data.playerId];
  if (delays[data.playerId]) system.clearRun(delays[data.playerId]);
  delete delays[data.playerId];
  delete cooldownUntil[data.playerId];
  delete recentlyBlocked[data.playerId];
});

world.afterEvents.itemStartUse.subscribe((data) => {
  usingItem[data.source.id] = true;
});

world.afterEvents.itemStopUse.subscribe((data) => {
  delete usingItem[data.source.id];
});

world.afterEvents.itemReleaseUse.subscribe((data) => {
  delete usingItem[data.source.id];
});
