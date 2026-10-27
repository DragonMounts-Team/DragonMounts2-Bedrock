// Feeds in-game dragon activity into the lib event bus (and so to other addons).
import { onAfterEntityHurt } from "../core/combat_events.js";
import { registerIntervalTask } from "../core/scheduler.js";
import { emit } from "../lib/event_bus.js";
import { getDragonInfo, isDragon, listDragons } from "../lib/api.js";
import "../lib/bridge.js";

onAfterEntityHurt((event) => {
  const { hurtEntity, damage, damageSource } = event;
  if (!isDragon(hurtEntity)) return;
  emit("dragon_hurt", {
    dragon: getDragonInfo(hurtEntity),
    damage,
    cause: damageSource?.cause ?? null,
    attackerId: damageSource?.damagingEntity?.id ?? null,
  });
});

// Detect name-tag changes (anvil / name tag item / commands) without polling every tick.
const lastNames = new Map();
registerIntervalTask("dragon-lib-name-watch", 20, () => {
  const seen = new Set();
  for (const info of listDragons()) {
    seen.add(info.id);
    const previous = lastNames.get(info.id);
    lastNames.set(info.id, info.nameTag);
    if (previous !== undefined && previous !== info.nameTag) {
      emit("dragon_named", { dragonId: info.id, previous, current: info.nameTag, dragon: info });
    }
  }
  for (const id of lastNames.keys()) if (!seen.has(id)) lastNames.delete(id);
});
