import { world } from "@minecraft/server";
import * as settingsArrays from "../arrays/settings_arrays.js";

const DEFAULT_PLAYER_DRAGON_SPEED = 1;
const DEFAULT_WORLD_EGG_HATCH_SPEED = 1;
const PLAYER_SHOW_COLLARS_TAG = "dragonmounts2:show_collars";
const PLAYER_HIDE_COLLARS_TAG = "dragonmounts2:hide_collars";
const WORLD_EGG_HATCH_SPEED_PROPERTY = "dragonmounts2:egg_hatch_speed";
const WORLD_ENVIRONMENTAL_EFFECTS_PROPERTY =
  "dragonmounts2:environmental_breath_effects";
const FLIGHT_SPEED_TAGS = settingsArrays.flightSpeedTags;
const flightSpeedSelectionCache = new WeakMap();
let cachedWorldEnvironmentalEffects;
let cachedWorldEggHatchSpeed;
let reportedWorldSettingError = false;

export function getPlayerDragonSpeed(player) {
  return [0.5, 1, 1.25][getPlayerDragonSpeedSelection(player)];
}

export function getPlayerDragonSpeedSelection(player) {
  if (!player?.isValid) return DEFAULT_PLAYER_DRAGON_SPEED;
  const cachedSelection = flightSpeedSelectionCache.get(player);
  if (cachedSelection !== undefined) return cachedSelection;
  const tags = player.getTags();
  const selected = FLIGHT_SPEED_TAGS.findIndex((tag) => tags.includes(tag));
  const selection = selected === -1 ? DEFAULT_PLAYER_DRAGON_SPEED : selected;
  flightSpeedSelectionCache.set(player, selection);
  return selection;
}

export function setPlayerDragonSpeed(player, value) {
  if (!player?.isValid) return false;
  const numericValue = Number(value);
  const selection = Number.isFinite(numericValue)
    ? Math.max(0, Math.min(2, Math.round(numericValue)))
    : DEFAULT_PLAYER_DRAGON_SPEED;
  for (const tag of FLIGHT_SPEED_TAGS) {
    try {
      if (player.hasTag(tag)) player.removeTag(tag);
    } catch (error) {
      console.error(
        `[DragonMounts2] Could not clear flight speed setting: ${error?.message ?? error}`,
      );
      return false;
    }
  }
  try {
    player.addTag(FLIGHT_SPEED_TAGS[selection]);
    flightSpeedSelectionCache.set(player, selection);
    return true;
  } catch (error) {
    console.error(
      `[DragonMounts2] Could not save flight speed: ${error?.message ?? error}`,
    );
    return false;
  }
}

export function getWorldDragonEggHatchSpeed() {
  if (cachedWorldEggHatchSpeed !== undefined) return cachedWorldEggHatchSpeed;
  try {
    const value = Number(world.getDynamicProperty(WORLD_EGG_HATCH_SPEED_PROPERTY));
    cachedWorldEggHatchSpeed = Number.isFinite(value)
      ? Math.max(1, Math.min(2, Math.round(value * 10) / 10))
      : DEFAULT_WORLD_EGG_HATCH_SPEED;
  } catch (error) {
    cachedWorldEggHatchSpeed = DEFAULT_WORLD_EGG_HATCH_SPEED;
    if (!reportedWorldSettingError) {
      reportedWorldSettingError = true;
      console.warn(`[DragonMounts2] Could not read world egg hatch speed: ${error?.message ?? error}`);
    }
  }
  return cachedWorldEggHatchSpeed;
}

export function setWorldDragonEggHatchSpeed(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return false;
  const speed = Math.max(1, Math.min(2, Math.round(numericValue * 10) / 10));
  try {
    world.setDynamicProperty(WORLD_EGG_HATCH_SPEED_PROPERTY, speed);
    const storedSpeed = Number(
      world.getDynamicProperty(WORLD_EGG_HATCH_SPEED_PROPERTY),
    );
    if (storedSpeed !== speed) {
      throw new Error(`Expected hatch speed ${speed}, got ${storedSpeed}`);
    }
    cachedWorldEggHatchSpeed = speed;
    return true;
  } catch (error) {
    console.error(`[DragonMounts2] Could not save world egg hatch speed: ${error?.message ?? error}`);
    return false;
  }
}

export function getWorldEnvironmentalEffectsEnabled() {
  if (cachedWorldEnvironmentalEffects !== undefined) {
    return cachedWorldEnvironmentalEffects;
  }
  try {
    const value = world.getDynamicProperty(WORLD_ENVIRONMENTAL_EFFECTS_PROPERTY);
    cachedWorldEnvironmentalEffects = value === undefined ? true : value === true;
  } catch (error) {
    cachedWorldEnvironmentalEffects = true;
    if (!reportedWorldSettingError) {
      reportedWorldSettingError = true;
      console.warn(`[DragonMounts2] Could not read world environmental setting: ${error?.message ?? error}`);
    }
  }
  return cachedWorldEnvironmentalEffects;
}

export function setWorldEnvironmentalEffectsEnabled(enabled) {
  const value = enabled === true;
  try {
    world.setDynamicProperty(WORLD_ENVIRONMENTAL_EFFECTS_PROPERTY, value);
    const storedValue = world.getDynamicProperty(
      WORLD_ENVIRONMENTAL_EFFECTS_PROPERTY,
    );
    if (storedValue !== value) {
      throw new Error(`Expected environmental setting ${value}, got ${storedValue}`);
    }
    cachedWorldEnvironmentalEffects = value;
    return true;
  } catch (error) {
    console.error(`[DragonMounts2] Could not save world environmental setting: ${error?.message ?? error}`);
    return false;
  }
}

export function getPlayerCollarVisibility(player) {
  if (!player?.isValid) return true;
  if (player.hasTag(PLAYER_HIDE_COLLARS_TAG)) return false;
  return true;
}

export function setPlayerCollarVisibility(player, visible) {
  if (!player?.isValid) return false;
  try {
    if (visible) {
      if (player.hasTag(PLAYER_HIDE_COLLARS_TAG)) {
        player.removeTag(PLAYER_HIDE_COLLARS_TAG);
      }
      if (!player.hasTag(PLAYER_SHOW_COLLARS_TAG)) {
        player.addTag(PLAYER_SHOW_COLLARS_TAG);
      }
    } else {
      if (player.hasTag(PLAYER_SHOW_COLLARS_TAG)) {
        player.removeTag(PLAYER_SHOW_COLLARS_TAG);
      }
      if (!player.hasTag(PLAYER_HIDE_COLLARS_TAG)) {
        player.addTag(PLAYER_HIDE_COLLARS_TAG);
      }
    }
    return true;
  } catch (error) {
    console.error(
      `[DragonMounts2] Could not save collar visibility: ${error?.message ?? error}`,
    );
    return false;
  }
}

export function getSoundOptions(options = {}) {
  return options;
}
