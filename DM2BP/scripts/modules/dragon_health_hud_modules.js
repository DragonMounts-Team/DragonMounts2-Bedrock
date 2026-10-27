import { EquipmentSlot, system, world } from "@minecraft/server";
import { dragonTypeIds } from "../data/entity_data.js";
import { registerIntervalTask } from "../core/scheduler.js";
import { onPlayerLeave } from "../core/player_lifecycle.js";
import { onScriptEvent } from "../core/script_events.js";
import { getDragonNameTag, getDragonTypeToken } from "../lib/dragon_names.js";
import { getDragonHealth } from "../lib/api.js";

// HUD wire format (read by the resource pack UI):
//   title    : "dm2hp<percent>"
//   subtitle : "|<type>|" (type is "jeb" when the dragon is named jeb_)  [ "|a|" if the rider wears armor ]  [ "|n|<name>" if the dragon has a name tag ]
// Every flag is a self-contained |x| token and the name is LAST with no terminator. Names never
// contain "|", so the UI can strip the known tokens ("|fire|", "|a|", "|n|") and be left with the
// exact name, no matter what letters it starts or ends with.
const JEB_NAME = "jeb_";
const RAINBOW_CODES = ["c", "6", "e", "a", "b", "9", "d"];
const RAINBOW_STEP_TICKS = 4;

// Colours each letter with a Minecraft colour code and shifts them over time.
function rainbowText(text) {
  const phase = Math.floor(system.currentTick / RAINBOW_STEP_TICKS);
  return [...text].map((ch, i) => `§${RAINBOW_CODES[(i + phase) % RAINBOW_CODES.length]}${ch}`).join("");
}
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
// Players who turned on the live readout with: /scriptevent dragonmounts2:hud_debug
const debugging = new Map();

function ridingDragon(player) {
  try {
    const dragon = player.getComponent("minecraft:riding")?.entityRidingOn;
    return dragon?.isValid && dragonTypeIds.has(dragon.typeId) ? dragon : undefined;
  } catch {
    return undefined;
  }
}

function wearsArmor(player) {
  try {
    const equippable = player.getComponent("minecraft:equippable");
    return ARMOR_SLOTS.some((slot) => equippable?.getEquipment(slot) !== undefined);
  } catch {
    return false;
  }
}

function buildSubtitle(player, dragon) {
  const name = getDragonNameTag(dragon);
  // Naming a dragon "jeb_" swaps its bar to the rainbow one, like the sheep.
  const type = name === JEB_NAME ? "jeb" : getDragonTypeToken(dragon.typeId);
  return `|${type}|${wearsArmor(player) ? "|a|" : ""}${name ? `|n|${type === "jeb" ? rainbowText(name) : name}` : ""}`;
}

function sendBar(player, dragon, state, percent, subtitle) {
  player.onScreenDisplay.setTitle(`${MARKER}${percent}`, {
    subtitle,
    fadeInDuration: 0,
    stayDuration: STAY_TICKS,
    fadeOutDuration: 0,
  });
  state.percent = percent;
  state.subtitle = subtitle;
  state.tick = system.currentTick;
  state.sends = (state.sends ?? 0) + 1;
}

function hideBar(player) {
  try {
    player.onScreenDisplay.setTitle(OFF_MARKER, {
      subtitle: "|off|",
      fadeInDuration: 0,
      stayDuration: 20,
      fadeOutDuration: 0,
    });
  } catch {
    // player already gone
  }
}

function updatePlayer(player) {
  const dragon = ridingDragon(player);
  if (!dragon) {
    if (showing.delete(player.id)) hideBar(player);
    return;
  }
  const percent = getDragonHealth(dragon).percent;
  const subtitle = buildSubtitle(player, dragon);
  let state = showing.get(player.id);
  const isNew = !state;
  if (isNew) {
    state = {};
    showing.set(player.id, state);
  }
  if (
    isNew ||
    percent !== state.percent ||
    subtitle !== state.subtitle ||
    system.currentTick - state.tick >= REFRESH_TICKS
  ) {
    sendBar(player, dragon, state, percent, subtitle);
  }
  if (debugging.has(player.id)) showDebug(player, dragon, state, percent);
}

function safeNum(read) {
  try {
    return Number(read()).toFixed(1);
  } catch {
    return "?";
  }
}

function showDebug(player, dragon, state, percent) {
  try {
    const health = getDragonHealth(dragon);
    player.onScreenDisplay.setActionBar(
      `§7[HUD] real §f${health.current.toFixed(1)}§7/§f${health.max}§7 §8(game max ${safeNum(() => dragon.getComponent("minecraft:health").effectiveMax)}, default ${safeNum(() => dragon.getComponent("minecraft:health").defaultValue)})§7 -> sent §a${MARKER}${state.percent}§7 (calc ${percent}%)` +
        ` §8| §7sub §f${state.subtitle} §8| §7sends §f${state.sends} §8| §7age §f${system.currentTick - state.tick}t`,
    );
  } catch {
    // debug output must never affect the HUD
  }
}

registerIntervalTask("dragon-health-hud", UPDATE_INTERVAL_TICKS, () => {
  for (const player of world.getAllPlayers()) {
    try {
      if (player.isValid) updatePlayer(player);
    } catch {
      // one bad player must never stop the HUD for everyone else
    }
  }
});

onPlayerLeave(({ playerId }) => {
  showing.delete(playerId);
  debugging.delete(playerId);
});

// Toggle the live readout:  /scriptevent dragonmounts2:hud_debug
onScriptEvent((event) => {
  if (event.id !== "dragonmounts2:hud_debug") return;
  const player = event.sourceEntity;
  if (!player?.isValid || player.typeId !== "minecraft:player") return;
  const on = !debugging.has(player.id);
  if (on) debugging.set(player.id, true);
  else debugging.delete(player.id);
  player.sendMessage(`§e[DragonMounts2] HUD debug ${on ? "ON (ride a dragon and watch the action bar)" : "OFF"}`);
});
