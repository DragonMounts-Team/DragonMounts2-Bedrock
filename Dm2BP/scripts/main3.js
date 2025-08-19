import {
  world,
  system,
  EntityEquippableComponent,
  EquipmentSlot
} from "@minecraft/server";

system.runInterval(() => {
  for (let p of world.getPlayers()) {
    if (p.isSneaking && !p.hasTag("hit") && !p.hasTag("beh")) {
      if (
        (p.hasTag("shield_offhand") || p.hasTag("shield_mainhand")) &&
        !p.hasTag("broken")
      ) {
        p.addTag("blocking");
      } else {
        p.removeTag("blocking");
      }
    }
    if (!p.isSneaking) {
      p.removeTag("blocking");
    }
    if (p.hasTag("hit")) {
      p.removeTag("blocking");
      system.runTimeout(() => {
        p.removeTag("hit");
      }, 20);
    }
    if (p.hasTag("beh")) {
      system.runTimeout(() => {
        p.removeTag("beh");
      }, 80);
    }
  }
});

world.afterEvents.entityHurt.subscribe((hurt) => {
  const player = hurt.hurtEntity;
  const damaging = hurt.damageSource.damagingEntity;
  if (!player || player.typeId !== "minecraft:player" || !damaging) return;

  const equipment = player.getComponent(EntityEquippableComponent.componentId);
  const health = player.getComponent("minecraft:health");
  const fromBehind = isBehind(player, damaging);

  // Nếu bị đánh từ phía sau
  if (fromBehind) {
    player.addTag("beh");
    return;
  }

  // Nếu không bị đánh từ sau và là các loại sát thương có thể đỡ
  if (
    ["entityAttack", "projectile", "entityExplosion", "blockExplosion"].includes(hurt.damageSource.cause) &&
    player.hasTag("blocking")
  ) {
    const direction = {
      x: damaging.location.x - player.location.x,
      y: damaging.location.y - player.location.y,
      z: damaging.location.z - player.location.z
    };

    // Kiểm tra khiên mainhand
    try {
      const mainHandItem = equipment.getEquipment(EquipmentSlot.Mainhand);
      if (
        mainHandItem &&
        mainHandItem.typeId.includes(":shield") &&
        mainHandItem.hasComponent("minecraft:durability")
      ) {
        const dur = mainHandItem.getComponent("minecraft:durability");
        dur.damage += 1;
        if (dur.damage >= dur.maxDurability) {
          player.playSound("random.break");
          equipment.setEquipment(EquipmentSlot.Mainhand, null);
        } else {
          equipment.setEquipment(EquipmentSlot.Mainhand, mainHandItem);
          player.playSound("item.shield.block");
          player.teleport(player.location, { rotation: player.getRotation() });
          damaging.applyKnockback(direction.x, direction.z, 1.3, 1.3 * 0.4);
          player.removeEffect("hunger");
          player.removeEffect("wither");
          player.removeEffect("poison");
          const damage = Math.round(hurt.damage);
          health.setCurrentValue(health.currentValue + damage);
        }
        return;
      }
    } catch (e) {}

    // Kiểm tra khiên offhand
    try {
      const offHandItem = equipment.getEquipment(EquipmentSlot.Offhand);
      if (
        offHandItem &&
        offHandItem.typeId.includes(":shield") &&
        offHandItem.hasComponent("minecraft:durability")
      ) {
        const dur = offHandItem.getComponent("minecraft:durability");
        dur.damage += 1;
        if (dur.damage >= dur.maxDurability) {
          player.playSound("random.break");
          equipment.setEquipment(EquipmentSlot.Offhand, null);
        } else {
          equipment.setEquipment(EquipmentSlot.Offhand, offHandItem);
          player.playSound("item.shield.block");
          player.teleport(player.location, { rotation: player.getRotation() });
          damaging.applyKnockback(direction.x, direction.z, 1.3, 1.3 * 0.4);
          player.removeEffect("hunger");
          player.removeEffect("wither");
          player.removeEffect("poison");
          const damage = Math.round(hurt.damage);
          health.setCurrentValue(health.currentValue + damage);
        }
      }
    } catch (e) {}
  }
});

world.afterEvents.entityHitBlock.subscribe((hitBlock) => {
  const player = hitBlock.damagingEntity;
  if (player.typeId === "minecraft:player") {
    player.addTag("hit");
  }
});

world.afterEvents.itemUse.subscribe((itemUse) => {
  const player = itemUse.source;
  if (player.typeId === "minecraft:player") {
    player.addTag("hit");
  }
});

world.afterEvents.playerPlaceBlock.subscribe((blockPlace) => {
  const player = blockPlace.player;
  if (player.typeId === "minecraft:player") {
    player.addTag("hit");
  }
});

// Hàm xác định bị đánh từ sau lưng
function isBehind(player, attacker) {
  const look = player.getViewDirection();
  const dx = attacker.location.x - player.location.x;
  const dz = attacker.location.z - player.location.z;
  const dot = look.x * dx + look.z * dz;
  return dot < 0;
}