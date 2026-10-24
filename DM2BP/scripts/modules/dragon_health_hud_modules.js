import { EquipmentSlot, system, world } from "@minecraft/server";
import { dragonTypeIds } from "../data/entity_data.js";

const MARKER = "dm2hp";
const OFF_MARKER = "dm2off";
const UPDATE_INTERVAL_TICKS = 1;
const REFRESH_TICKS = 10;
const STAY_TICKS = 20;
const ARMOR_SLOTS = [
  EquipmentSlot.Head,
  EquipmentSlot.Chest,
  EquipmentSlot.Legs,
  EquipmentSlot.Feet,
];

const showing = new Map();
function ridingDragon(player) {
  try {
    const dragon = player.getComponent("minecraft:riding")?.entityRidingOn;
    return dragon?.isValid && dragonTypeIds.has(dragon.typeId) ? dragon : undefined;
  } catch {
    return undefined;
  }
}
function dragonToken(dragon) {
  return dragon.typeId.replace("dragonmounts2:", "").replace("_dragon", "");
}
function wearsArmor(player) {
  try {
    const equippable = player.getComponent("minecraft:equippable");
    return ARMOR_SLOTS.some((slot) => equippable?.getEquipment(slot) !== undefined);
  } catch {
    return false;
  }
}
function healthPercent(dragon) {
  try {
    const health = dragon.getComponent("minecraft:health");
    const max = health?.effectiveMax ?? 0;
    if (!(max > 0)) return 100;
    const current = Math.max(0, health.currentValue);
    const percent = Math.round((current / max) * 100);
    return current > 0 ? Math.max(1, Math.min(100, percent)) : 0;
  } catch {
    return 100;
  }
}
function sendBar(player, dragon, state) {
  const percent = healthPercent(dragon);
  const subtitle = `|${dragonToken(dragon)}|${wearsArmor(player) ? "a|" : ""}`;
  player.onScreenDisplay.setTitle(`${MARKER}${percent}`, {
    subtitle,
    fadeInDuration: 0,
    stayDuration: STAY_TICKS,
    fadeOutDuration: 0,
  });
  state.percent = percent;
  state.subtitle = subtitle;
  state.tick = system.currentTick;
}
function update() {
  for (const player of world.getAllPlayers()) {
    const dragon = ridingDragon(player);
    if (!dragon) {
      if (showing.delete(player.id)) {
        try {
          player.onScreenDisplay.setTitle(OFF_MARKER, {
            subtitle: "|off|",
            fadeInDuration: 0,
            stayDuration: 20,
            fadeOutDuration: 0,
          });
        } catch {
        }
      }
      continue;
    }
    try {
      let state = showing.get(player.id);
      if (!state) {
        state = {};
        showing.set(player.id, state);
        sendBar(player, dragon, state);
        continue;
      }
      const percent = healthPercent(dragon);
      const subtitle = `|${dragonToken(dragon)}|${wearsArmor(player) ? "a|" : ""}`;
      if (
        percent !== state.percent ||
        subtitle !== state.subtitle ||
        system.currentTick - state.tick >= REFRESH_TICKS
      ) {
        sendBar(player, dragon, state);
      }
    } catch {
    }
  }
}

system.runInterval(update, UPDATE_INTERVAL_TICKS);
world.afterEvents.playerLeave.subscribe(({ playerId }) => showing.delete(playerId));
