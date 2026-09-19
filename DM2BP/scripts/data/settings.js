import * as settingsArrays from "../arrays/settings_arrays.js";

const DEFAULT_PLAYER_DRAGON_SPEED = 1;
const PLAYER_SHOW_COLLARS_TAG = "dragonmounts2:show_collars";
const PLAYER_HIDE_COLLARS_TAG = "dragonmounts2:hide_collars";
const FLIGHT_SPEED_TAGS = settingsArrays.flightSpeedTags;
const flightSpeedSelectionCache = new WeakMap();

export function getPlayerDragonSpeed(player) {
  return [0.5, 1][getPlayerDragonSpeedSelection(player)];
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
  if (!player?.isValid) return;
  const numericValue = Number(value);
  const selection = Number.isFinite(numericValue)
    ? Math.max(0, Math.min(1, Math.round(numericValue)))
    : DEFAULT_PLAYER_DRAGON_SPEED;
  for (const tag of FLIGHT_SPEED_TAGS) {
    try {
      if (player.hasTag(tag)) player.removeTag(tag);
    } catch {}
  }
  try {
    player.addTag(FLIGHT_SPEED_TAGS[selection]);
    flightSpeedSelectionCache.set(player, selection);
  } catch (error) {
    console.error(
      `[DragonMounts2] Could not save flight speed: ${error?.message ?? error}`,
    );
  }
}

export function getPlayerCollarVisibility(player) {
  if (!player?.isValid) return true;
  if (player.hasTag(PLAYER_HIDE_COLLARS_TAG)) return false;
  return true;
}

export function setPlayerCollarVisibility(player, visible) {
  if (!player?.isValid) return;
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
  } catch (error) {
    console.error(
      `[DragonMounts2] Could not save collar visibility: ${error?.message ?? error}`,
    );
  }
}

export function getSoundOptions(options = {}) {
  return options;
}
