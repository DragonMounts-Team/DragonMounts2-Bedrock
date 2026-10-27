// Tiny in-process event bus. Handler failures never reach the emitter.
const listeners = new Map();

export function on(eventName, handler) {
  if (typeof handler !== "function") return () => {};
  let set = listeners.get(eventName);
  if (!set) listeners.set(eventName, (set = new Set()));
  set.add(handler);
  return () => off(eventName, handler);
}

export function off(eventName, handler) {
  const set = listeners.get(eventName);
  if (!set) return;
  set.delete(handler);
  if (set.size === 0) listeners.delete(eventName);
}

export function emit(eventName, payload) {
  const set = listeners.get(eventName);
  if (!set) return;
  for (const handler of [...set]) {
    try {
      handler(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[DragonMounts2] lib event "${eventName}" handler failed: ${message}`);
    }
  }
}
