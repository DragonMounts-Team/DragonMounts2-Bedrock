// Owner-level formation order (Patch A). Pure functions only: no Minecraft
// imports, so they can be unit-tested outside the game (see tests/).
//
// The order is a list of dragon persistent IDs, index 0 = rank 1, at most
// MAX_FLIGHT_RANK long. A dragon that is not in the list is "Auto" (rank 0).
// A list is unique by construction, and a rank change is one write that does
// not need any dragon to be loaded.

export const MAX_FLIGHT_RANK = 4;
export const FORMATION_MAX_DRAGONS = 4;
export const FORMATION_REASSIGN_MODE = "swap"; // "swap" | "shift"
export const FORMATION_COMPACT = true;

// Drops non-strings, duplicates and anything past the cap.
export function normalize(list, max = MAX_FLIGHT_RANK) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const pid of list) {
    if (typeof pid !== "string" || !pid || out.includes(pid)) continue;
    out.push(pid);
    if (out.length >= max) break;
  }
  return out;
}

export function parse(raw, max = MAX_FLIGHT_RANK) {
  if (typeof raw !== "string" || !raw) return [];
  try {
    return normalize(JSON.parse(raw), max);
  } catch {
    return [];
  }
}

export function serialize(list) {
  return JSON.stringify(list);
}

// 1-based rank, or 0 for Auto.
export function rankOf(list, pid) {
  const index = list.indexOf(pid);
  return index < 0 ? 0 : index + 1;
}

export function sameList(a, b) {
  return a.length === b.length && a.every((pid, i) => pid === b[i]);
}

// Returns a NEW list with `pid` placed at rank `target` (0 = Auto).
//   swap  (default): whoever holds the target rank takes the mover's old rank
//                    (or becomes Auto if the mover was Auto).
//   shift: the mover is inserted and everyone in between moves one place; a
//          dragon pushed past the cap falls to Auto.
export function place(list, pid, target, mode = FORMATION_REASSIGN_MODE, max = MAX_FLIGHT_RANK) {
  const base = normalize(list, max);
  const index = base.indexOf(pid);
  const wanted = Math.floor(Number(target));
  if (!Number.isFinite(wanted) || wanted <= 0) {
    if (index >= 0) base.splice(index, 1);
    return base;
  }
  // Clamp so the list never has holes.
  const rank = Math.min(wanted, max, base.length + (index >= 0 ? 0 : 1));
  if (index === rank - 1) return base;

  if (mode === "shift") {
    if (index >= 0) base.splice(index, 1);
    base.splice(rank - 1, 0, pid);
    return base.slice(0, max);
  }

  if (index >= 0) {
    // Both positions exist (rank <= length), so this is a plain swap.
    [base[index], base[rank - 1]] = [base[rank - 1], base[index]];
    return base;
  }
  if (rank - 1 < base.length) base[rank - 1] = pid; // the old holder becomes Auto
  else base.push(pid);
  return base;
}

// Next rank in Auto, 1, ..., cap, Auto, where cap = min(max, dragons in the
// list, plus one if the dragon is Auto), so two dragons cycle Auto, 1, 2, Auto.
export function nextCycleRank(list, pid, max = MAX_FLIGHT_RANK) {
  const base = normalize(list, max);
  const current = rankOf(base, pid);
  const cap = Math.min(max, base.length + (current === 0 ? 1 : 0));
  if (cap <= 0) return 0;
  return current >= cap ? 0 : current + 1;
}

export function cycle(list, pid, mode = FORMATION_REASSIGN_MODE, max = MAX_FLIGHT_RANK) {
  return place(list, pid, nextCycleRank(list, pid, max), mode, max);
}

// Persistent IDs look like <typeId>_<Date.now()>_<random>; the second-to-last
// "_" segment is a stable age proxy that survives reloads.
export function pidTimestamp(pid) {
  if (typeof pid !== "string") return Infinity;
  const parts = pid.split("_");
  const stamp = Number(parts[parts.length - 2]);
  return Number.isFinite(stamp) ? stamp : Infinity;
}

export function compareByAge(a, b) {
  const diff = pidTimestamp(a) - pidTimestamp(b);
  if (diff !== 0 && Number.isFinite(diff)) return diff;
  return a < b ? -1 : a > b ? 1 : 0;
}

// Which eligible dragons fly, and in what slot.
//   eligible        persistent IDs that pass the flock filter
//   order           the owner's formation order
//   mainPid         the dragon the owner rode most recently (or null)
//   sessionOrder    autos in the order they first joined this flight
// With `compact`, gaps close (ranks 3 and 4 only -> slots 1 and 2). Without it
// a ranked dragon keeps the absolute slot its rank says.
export function assignSlots(eligible, order, mainPid = null, sessionOrder = [], options = {}) {
  const { compact = FORMATION_COMPACT, slots = FORMATION_MAX_DRAGONS } = options;
  const live = new Set(eligible);
  const ranked = order.filter((pid) => live.has(pid));
  const inOrder = new Set(order);
  const sessionIndex = new Map(sessionOrder.map((pid, i) => [pid, i]));
  const autos = eligible.filter((pid) => !inOrder.has(pid)).sort((a, b) => {
    const sa = sessionIndex.has(a) ? sessionIndex.get(a) : Infinity;
    const sb = sessionIndex.has(b) ? sessionIndex.get(b) : Infinity;
    if (sa !== sb) return sa < sb ? -1 : 1;
    if ((a === mainPid) !== (b === mainPid)) return a === mainPid ? -1 : 1;
    return compareByAge(a, b);
  });
  if (compact) return [...ranked, ...autos].slice(0, slots);

  const result = new Array(slots).fill(null);
  for (const pid of ranked) {
    const slot = order.indexOf(pid);
    if (slot < slots) result[slot] = pid;
  }
  for (const pid of autos) {
    const free = result.indexOf(null);
    if (free >= 0) result[free] = pid;
  }
  return result;
}

// Legacy per-dragon ranks (flight_rank) -> one list. Sorted by rank, then pid.
export function migrateLegacy(entries, max = MAX_FLIGHT_RANK) {
  return normalize(
    entries
      .filter((entry) => entry.rank > 0)
      .sort((a, b) => (a.rank - b.rank) || (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : 0))
      .map((entry) => entry.pid),
    max,
  );
}

// A legacy-ranked dragon that loads later is inserted once at min(rank-1, length).
export function insertLegacy(list, pid, rank, max = MAX_FLIGHT_RANK) {
  const base = normalize(list, max);
  if (base.includes(pid) || !(rank > 0)) return base;
  base.splice(Math.min(rank - 1, base.length), 0, pid);
  return base.slice(0, max);
}

export function remove(list, pid) {
  return list.filter((entry) => entry !== pid);
}
