import { system } from "@minecraft/server";
import { onAfterEntityHurt } from "../core/combat_events.js";
import { onScriptEvent } from "../core/script_events.js";
import { getSoundOptions } from "../data/settings.js";
import { dragonTypeIds } from "../data/entity_data.js";

// Mirrors Java DM2: when a dragon is hurt and is not breathing it has a 25%
// chance to roar. The jaw is open for the length of the growl.
//
// Each growl clip has its own sound id (see sound_definitions.json) so the
// exact length is known. `dragonmounts2:roar_ticks` is set to that length;
// the resource pack opens the jaw for it (animation.dragonmounts2.dragon.roar
// through controller.animation.dragonmounts2.dragon.roar) and it is reset to 0
// when the sound ends.

const ROAR_PROPERTY = "dragonmounts2:roar_ticks";
const ROAR_CHANCE = 0.25;
// Gap after a roar before another can start, so the client sees the jaw reset.
const ROAR_GAP_TICKS = 10;

// Java: volume = clamp(ageScale, 0.3, 0.6). Baby is clamped low, adults high.
const ROAR_VOLUME = { baby: 0.3, juvenile: 0.5, adult: 0.6 };

// Clip lengths in ticks (rounded up from the .ogg durations).
const GROWLS = [
  { id: "dragonmounts2:mob.dragon.growl.1", ticks: 37 },
  { id: "dragonmounts2:mob.dragon.growl.2", ticks: 31 },
  { id: "dragonmounts2:mob.dragon.growl.3", ticks: 61 },
  { id: "dragonmounts2:mob.dragon.growl.4", ticks: 64 },
];
const BABY_GROWLS = [
  { id: "dragonmounts2:mob.dragon.baby.growl.1", ticks: 32 },
  { id: "dragonmounts2:mob.dragon.baby.growl.2", ticks: 29 },
];
const WATER_GROWLS = [
  { id: "dragonmounts2:mob.dragon.water_growl.1", ticks: 79 },
  { id: "dragonmounts2:mob.dragon.water_growl.2", ticks: 79 },
  { id: "dragonmounts2:mob.dragon.water_growl.3", ticks: 73 },
];

const roarState = new WeakMap(); // dragon -> { token, endTick }

function readProperty(dragon, id, fallback) {
  try {
    return dragon.getProperty(id) ?? fallback;
  } catch {
    return fallback;
  }
}

function pickGrowl(dragon, age) {
  const list =
    age === "baby"
      ? BABY_GROWLS
      : dragon.typeId === "dragonmounts2:water_dragon"
        ? WATER_GROWLS
        : GROWLS;
  return list[Math.floor(Math.random() * list.length)];
}

export function roarDragon(dragon) {
  if (!dragon?.isValid) return false;
  if (readProperty(dragon, "dragonmounts2:death_ticks", 0) > 0) return false;
  if (readProperty(dragon, "dragonmounts2:is_breathing", false)) return false;

  const now = system.currentTick;
  const state = roarState.get(dragon) ?? { token: 0, endTick: 0 };
  if (now < state.endTick + ROAR_GAP_TICKS) return false; // still roaring

  const age = readProperty(dragon, "dragonmounts2:age_variant", "adult");
  const growl = pickGrowl(dragon, age);

  try {
    dragon.setProperty(ROAR_PROPERTY, growl.ticks);
  } catch (error) {
    console.warn(`[DragonMounts2] Could not set ${ROAR_PROPERTY} on ${dragon.typeId}: ${error?.message ?? error}`);
    return false;
  }
  dragon.dimension.playSound(
    growl.id,
    dragon.location,
    getSoundOptions({
      volume: ROAR_VOLUME[age] ?? ROAR_VOLUME.adult,
      pitch: age === "baby" ? 0.5 : 1,
    }),
  );

  state.token++;
  state.endTick = now + growl.ticks;
  roarState.set(dragon, state);
  const token = state.token;
  system.runTimeout(() => {
    try {
      if (dragon.isValid && roarState.get(dragon)?.token === token) {
        dragon.setProperty(ROAR_PROPERTY, 0);
      }
    } catch {
      // dragon unloaded before the roar ended
    }
  }, growl.ticks);
  return true;
}

onAfterEntityHurt(({ hurtEntity }) => {
  if (!hurtEntity?.isValid || !dragonTypeIds.has(hurtEntity.typeId)) return;
  if (Math.random() < ROAR_CHANCE) roarDragon(hurtEntity);
});

// Test helper: /execute as <dragon> run scriptevent dragonmounts2:roar
// (always roars, ignoring the 25% hurt chance).
onScriptEvent((event) => {
  if (event.id !== "dragonmounts2:roar") return;
  const entity = event.sourceEntity;
  if (entity?.isValid && dragonTypeIds.has(entity.typeId)) roarDragon(entity);
});
