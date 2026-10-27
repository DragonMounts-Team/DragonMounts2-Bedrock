// Name-tag helpers shared by the HUD, the public API and other addons.
// Pure functions only (no world access) so they are safe to call anywhere.

export const MAX_HUD_NAME_LENGTH = 24;

// Characters that would break the HUD wire format ("|" is the field separator).
const UNSAFE_CHARS = /[|\r\n\t\u0000-\u001f]/g;

/**
 * Cleans a raw name tag for display. Returns "" when there is nothing usable.
 * Formatting codes (§) are removed so the HUD keeps its own colouring.
 */
export function sanitizeDragonName(raw, maxLength = MAX_HUD_NAME_LENGTH) {
  if (typeof raw !== "string") return "";
  let name = raw
    .replace(/§./g, "")
    .replace(UNSAFE_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length > maxLength) name = `${name.slice(0, maxLength - 1).trimEnd()}…`;
  return name;
}

/** Returns the sanitised name tag of an entity, or "" when it has none. */
export function getDragonNameTag(dragon) {
  try {
    if (!dragon?.isValid) return "";
    return sanitizeDragonName(dragon.nameTag);
  } catch {
    return "";
  }
}

/** "dragonmounts2:fire_dragon" -> "fire" */
export function getDragonTypeToken(typeId) {
  if (typeof typeId !== "string") return "";
  return typeId.replace(/^[^:]+:/, "").replace(/_dragon$/, "");
}

/** Name tag when present, otherwise the dragon type ("Fire"). */
export function getDragonDisplayName(dragon) {
  const tag = getDragonNameTag(dragon);
  if (tag) return tag;
  const token = getDragonTypeToken(dragon?.typeId);
  return token ? token.charAt(0).toUpperCase() + token.slice(1) : "";
}
