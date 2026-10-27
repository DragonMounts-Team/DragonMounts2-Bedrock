// Script-event bridge so OTHER addons can talk to DragonMounts2.
//
// Request  : /scriptevent dragonmounts2:lib <json>   (or system.sendScriptEvent)
//   { "action": "ping" | "getDragon" | "listDragons",
//     "replyTo": "myaddon:dm2_reply",   // required, must be "namespace:id"
//     "requestId": "any string",        // echoed back
//     "entityId": "...",                // getDragon
//     "ownerId": "...", "offset": 0, "limit": 5   // listDragons (optional)
//   }
// Reply    : sendScriptEvent(replyTo, { requestId, ok, libVersion, data | error })
// Broadcast: dragonmounts2:lib_event  { event, libVersion, data }
//            events: "ready", "dragon_hurt", "dragon_named"
import { system } from "@minecraft/server";
import { onScriptEvent } from "../core/script_events.js";
import { onWorldEvent } from "../core/world_events.js";
import { on } from "./event_bus.js";
import { LIB_VERSION, getDragonById, getDragonInfo, listDragons } from "./api.js";

export const REQUEST_EVENT_ID = "dragonmounts2:lib";
export const BROADCAST_EVENT_ID = "dragonmounts2:lib_event";

const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_PAGE_SIZE = 5;
const MAX_PAGE_SIZE = 10;
const REPLY_TARGET = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/i;

function send(id, payload) {
  try {
    if (typeof system.sendScriptEvent !== "function") return false;
    const message = JSON.stringify(payload);
    if (message.length > MAX_MESSAGE_LENGTH) return false;
    system.sendScriptEvent(id, message);
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[DragonMounts2] Lib bridge could not send "${id}": ${reason}`);
    return false;
  }
}

function reply(request, ok, body) {
  const payload = { requestId: request.requestId ?? null, ok, libVersion: LIB_VERSION, ...body };
  if (send(request.replyTo, payload)) return;
  send(request.replyTo, {
    requestId: request.requestId ?? null,
    ok: false,
    libVersion: LIB_VERSION,
    error: "response_too_large",
  });
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const actions = {
  ping: () => ({ data: { name: "DragonMounts2", libVersion: LIB_VERSION } }),
  getDragon: (request) => {
    const dragon = getDragonById(request.entityId);
    if (!dragon) return { error: "dragon_not_found" };
    return { data: getDragonInfo(dragon) };
  },
  listDragons: (request) => {
    const offset = clampInt(request.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = clampInt(request.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const all = listDragons({ ownerId: typeof request.ownerId === "string" ? request.ownerId : undefined });
    return { data: { total: all.length, offset, dragons: all.slice(offset, offset + limit) } };
  },
};

onScriptEvent((event) => {
  if (event.id !== REQUEST_EVENT_ID) return;
  let request;
  try {
    request = JSON.parse(event.message);
  } catch {
    return; // not JSON, nobody to answer
  }
  if (!request || typeof request !== "object") return;
  if (typeof request.replyTo !== "string" || !REPLY_TARGET.test(request.replyTo)) return;
  if (request.replyTo === REQUEST_EVENT_ID) return; // never answer ourselves
  const handler = Object.prototype.hasOwnProperty.call(actions, request.action) ? actions[request.action] : undefined;
  if (!handler) {
    reply(request, false, { error: "unknown_action" });
    return;
  }
  try {
    const result = handler(request);
    if (result.error) reply(request, false, { error: result.error });
    else reply(request, true, { data: result.data });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[DragonMounts2] Lib action "${request.action}" failed: ${reason}`);
    reply(request, false, { error: "internal_error" });
  }
});

function broadcast(eventName, data) {
  send(BROADCAST_EVENT_ID, { event: eventName, libVersion: LIB_VERSION, data });
}

on("dragon_hurt", (data) => broadcast("dragon_hurt", data));
on("dragon_named", (data) => broadcast("dragon_named", data));

// Tell other addons the lib is up once the world is ready.
let readySent = false;
function announceReady() {
  if (readySent) return;
  readySent = true;
  broadcast("ready", { name: "DragonMounts2" });
}
onWorldEvent("afterEvents", "worldLoad", announceReady);
system.runTimeout(announceReady, 100); // fallback if worldLoad already fired
