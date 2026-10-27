# DragonMounts2 Lib

Read-only API for other addons. Bedrock addons can't import each other's code,
so everything goes through script events with JSON messages.

## Request / reply

Send to `dragonmounts2:lib`:

```js
import { system } from "@minecraft/server";

system.afterEvents.scriptEventReceive.subscribe((e) => {
  if (e.id !== "myaddon:dm2_reply") return;
  const res = JSON.parse(e.message); // { requestId, ok, libVersion, data | error }
});

system.sendScriptEvent("dragonmounts2:lib", JSON.stringify({
  action: "getDragon", entityId: dragon.id,
  replyTo: "myaddon:dm2_reply", requestId: "abc",
}));
```

| action        | args                                | `data`                                   |
|---------------|-------------------------------------|------------------------------------------|
| `ping`        | none                                | `{ name, libVersion }`                   |
| `getDragon`   | `entityId`                          | dragon info (below)                      |
| `listDragons` | `ownerId?`, `offset?`, `limit?` (1-10, default 5) | `{ total, offset, dragons[] }` |

Errors: `unknown_action`, `dragon_not_found`, `response_too_large`, `internal_error`.
`replyTo` is required and must look like `namespace:id`.

Dragon info: `id, typeId, type, nameTag, hasNameTag, displayName, health{current,max,percent},
tamed, ownerId, ownerName, dimension, location{x,y,z}`.

## Broadcast events

Listen on `dragonmounts2:lib_event`; messages are `{ event, libVersion, data }`.

- `ready` - DragonMounts2 finished loading
- `dragon_hurt` - `{ dragon, damage, cause, attackerId }`
- `dragon_named` - `{ dragonId, previous, current, dragon }` (name tag added/changed/removed)

## In-pack use

`import { getDragonInfo, listDragons, on } from "./lib/index.js"`.

## HUD wire format (behavior pack -> resource pack)

Title `dm2hp<percent>`, subtitle `|<type>|[|a|][|n|<name>]`.

- `|a|` is present when the rider wears armor.
- `|n|<name>` is present only when the dragon has a name tag. The name is last, has no
  terminator, is at most 24 chars, and has `|` and formatting codes stripped.
- `DM2RP/ui/hud_screen.json` removes the known tokens (`|<type>|`, `|a|`, `|n|`) to get the
  exact name, then shows it in place of the localized "<Type> Dragon" label.

## Debugging the health bar

Ride a dragon and run `/scriptevent dragonmounts2:hud_debug` (run again to turn off). The action bar
then shows the dragon's real health, the `dm2hp<percent>` value being sent to the UI, the subtitle,
and how many updates were sent. Real health dropping but the sent value staying put is a script
problem; both dropping while the bar stays full is a resource-pack UI problem; real health not
dropping means the damage isn't reaching the dragon (the dragon damage sensor ignores fall,
drowning, suffocation, magic, wither, contact, thorns, void and fly-into-wall damage).
