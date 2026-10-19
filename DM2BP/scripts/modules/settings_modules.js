import { ModalFormData } from "@minecraft/server-ui";
import { world, Player, system } from "@minecraft/server";
import * as settings from "../data/settings.js";
import { onScriptEvent } from "../core/script_events.js";
import { onPlayerSpawn } from "../core/player_lifecycle.js";
import { getAddonDimensions } from "../lib/runtime.js";

function applyOwnedDragonCollars(player) {
  if (!(player instanceof Player) || !player.isValid) return;

  const showCollars = settings.getPlayerCollarVisibility(player);
  for (const dimension of getAddonDimensions()) {
    for (const dragon of dimension.getEntities({ families: ["dragon"] })) {
      if (!dragon?.isValid) continue;
      if (
        dragon.getDynamicProperty("dragonmounts2:owner_identifier") !==
        player.id
      ) {
        continue;
      }
      dragon.triggerEvent(
        showCollars ? "minecraft:on_collar" : "minecraft:on_no_collar",
      );
    }
  }
}

function getPlayer(source) {
  if (source instanceof Player) return source;
  if (source?.initiator instanceof Player) return source.initiator;
  if (source?.sourceEntity instanceof Player) return source.sourceEntity;
  if (source?.entity instanceof Player) return source.entity;
  const playerId =
    source?.id ??
    source?.initiator?.id ??
    source?.sourceEntity?.id ??
    source?.entity?.id;
  if (playerId)
    return (
      world.getAllPlayers().find((player) => player.id === playerId) ?? null
    );
  return null;
}

function showSettings(player) {
  if (!(player instanceof Player) || !player.isValid) {
    return;
  }

  try {
    const currentFlightSpeed = settings.getPlayerDragonSpeedSelection(player);
    const showCollars = settings.getPlayerCollarVisibility(player);
    const form = new ModalFormData()
      .title({ translate: "tooltip.dragonmounts2:settings.title" })
      .slider({ translate: "tooltip.dragonmounts2:settings.flight_speed" }, 0, 2, {
        valueStep: 1,
        defaultValue: currentFlightSpeed,
      })
      .toggle({ translate: "tooltip.dragonmounts2:settings.show_collars" }, { defaultValue: showCollars });

    system.runTimeout(() => {
      if (!player.isValid) return;
      form
        .show(player)
        .then((result) => {
          if (result.canceled || !result.formValues) return;
          settings.setPlayerDragonSpeed(player, result.formValues[0]);
          settings.setPlayerCollarVisibility(player, result.formValues[1]);
          applyOwnedDragonCollars(player);
          player.sendMessage({
            rawtext: [{ text: "§a" }, { translate: "tooltip.dragonmounts2:settings.saved" }],
          });
        })
        .catch((error) =>
          console.error(
            `[DragonMounts2] Settings form failed: ${error?.message ?? error}`,
          ),
        );
    }, 1);
  } catch (error) {
    console.error(
      `[DragonMounts2] Settings form could not be created: ${error?.message ?? error}`,
    );
  }
}

onPlayerSpawn(({ player }) => {
  system.run(() => applyOwnedDragonCollars(player));
});

onScriptEvent((event) => {
  if (event.id !== "dragonmounts2:open_settings") return;
  const player = getPlayer(event.sourceEntity);
  if (!player) {
    return;
  }
  showSettings(player);
});

export function registerSettingsCommand(customCommandRegistry) {
  customCommandRegistry.registerCommand(
    {
      name: "dragonmounts2:settings",
      description: "tooltip.dragonmounts2:command.settings.description",
      permissionLevel: 1,
      cheatsRequired: false,
    },
    (origin) => {
      showSettings(getPlayer(origin));
    },
  );
}
