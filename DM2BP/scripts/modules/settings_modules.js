import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import {
  world,
  Player,
  system,
  CommandPermissionLevel,
} from "@minecraft/server";
import * as settings from "../data/settings.js";
import { onScriptEvent } from "../core/script_events.js";
import { onPlayerSpawn } from "../core/player_lifecycle.js";
import { getAddonDimensions } from "../lib/runtime.js";
import { registerIntervalTask } from "../core/scheduler.js";

const appliedCollarVisibility = new WeakMap();

function updateDragonCollarVisibility(dragon, player) {
  if (!dragon?.isValid || !player?.isValid) return;
  const showCollars = settings.getPlayerCollarVisibility(player);
  const previous = appliedCollarVisibility.get(dragon);
  if (
    previous?.ownerId === player.id &&
    previous.showCollars === showCollars
  ) return;

  dragon.triggerEvent(
    showCollars ? "minecraft:on_collar" : "minecraft:on_no_collar",
  );
  appliedCollarVisibility.set(dragon, {
    ownerId: player.id,
    showCollars,
  });
}

function applyOwnedDragonCollars(player) {
  if (!(player instanceof Player) || !player.isValid) return;

  for (const dimension of getAddonDimensions()) {
    for (const dragon of dimension.getEntities({ families: ["dragon"] })) {
      if (!dragon?.isValid) continue;
      const ownerId =
        dragon.getComponent("minecraft:tameable")?.tamedToPlayerId ??
        dragon.getDynamicProperty("dragonmounts2:owner_identifier");
      if (ownerId !== player.id) {
        continue;
      }
      updateDragonCollarVisibility(dragon, player);
    }
  }
}

function syncLoadedDragonCollars() {
  const players = new Map(world.getAllPlayers().map((player) => [player.id, player]));
  if (!players.size) return;

  for (const dimension of getAddonDimensions()) {
    for (const dragon of dimension.getEntities({ families: ["dragon"] })) {
      if (!dragon?.isValid) continue;
      const ownerId =
        dragon.getComponent("minecraft:tameable")?.tamedToPlayerId ??
        dragon.getDynamicProperty("dragonmounts2:owner_identifier");
      const owner = typeof ownerId === "string" ? players.get(ownerId) : undefined;
      if (owner) updateDragonCollarVisibility(dragon, owner);
    }
  }
}

registerIntervalTask("dragon-collar-visibility", 20, syncLoadedDragonCollars);

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

function canEditWorldSettings(player) {
  try {
    return player.commandPermissionLevel >= CommandPermissionLevel.Host;
  } catch {
    return false;
  }
}

function showModal(player, form, onSubmit) {
  system.runTimeout(() => {
    if (!player.isValid) return;
    form
      .show(player)
      .then((result) => {
        if (result.canceled) return;
        if (!Array.isArray(result.formValues)) {
          console.error("[DragonMounts2] Settings form returned no values.");
          player.sendMessage({
            rawtext: [
              { text: "§c" },
              { translate: "tooltip.dragonmounts2:settings.save_failed" },
            ],
          });
          return;
        }
        system.run(() => onSubmit(result.formValues));
      })
      .catch((error) =>
        console.error(
          `[DragonMounts2] Settings form failed: ${error?.message ?? error}`,
        ),
      );
  }, 1);
}

function showPlayerSettings(player) {
  const form = new ModalFormData()
    .title({ translate: "tooltip.dragonmounts2:settings.player_section" })
    .dropdown(
      { translate: "tooltip.dragonmounts2:settings.flight_speed" },
      [
        { translate: "tooltip.dragonmounts2:settings.flight_speed_slow" },
        { translate: "tooltip.dragonmounts2:settings.flight_speed_default" },
        { translate: "tooltip.dragonmounts2:settings.flight_speed_fast" },
      ],
      {
        defaultValue: settings.getPlayerDragonSpeedSelection(player),
      },
    )
    .toggle(
      { translate: "tooltip.dragonmounts2:settings.show_collars" },
      { defaultValue: settings.getPlayerCollarVisibility(player) },
    );

  showModal(player, form, (values) => {
    if (
      values.length !== 2 ||
      typeof values[0] !== "number" ||
      !Number.isInteger(values[0]) ||
      values[0] < 0 ||
      values[0] > 2 ||
      typeof values[1] !== "boolean"
    ) {
      console.error(
        `[DragonMounts2] Invalid personal settings response: ${JSON.stringify(values)}`,
      );
      player.sendMessage({
        rawtext: [
          { text: "§c" },
          { translate: "tooltip.dragonmounts2:settings.save_failed" },
        ],
      });
      return;
    }
    const [flightSpeed, collarsVisible] = values;
    const flightSpeedSaved = settings.setPlayerDragonSpeed(player, flightSpeed);
    const collarsSaved = settings.setPlayerCollarVisibility(
      player,
      collarsVisible,
    );
    applyOwnedDragonCollars(player);
    const saved = flightSpeedSaved && collarsSaved;
    player.sendMessage({
      rawtext: [
        { text: saved ? "§a" : "§c" },
        {
          translate: saved
            ? "tooltip.dragonmounts2:settings.saved"
            : "tooltip.dragonmounts2:settings.save_failed",
        },
      ],
    });
    showSettings(player);
  });
}

function showWorldSettings(player) {
  const hatchSpeedOptions = Array.from(
    { length: 11 },
    (_, index) => `${(10 + index) / 10}×`,
  );
  const form = new ModalFormData()
    .title({ translate: "tooltip.dragonmounts2:settings.world_section" })
    .toggle(
      { translate: "tooltip.dragonmounts2:settings.environmental_effects" },
      { defaultValue: settings.getWorldEnvironmentalEffectsEnabled() },
    )
    .dropdown(
      { translate: "tooltip.dragonmounts2:settings.egg_hatch_speed" },
      hatchSpeedOptions,
      {
        defaultValue: Math.round(settings.getWorldDragonEggHatchSpeed() * 10) - 10,
      },
    );

  showModal(player, form, (values) => {
    if (
      values.length !== 2 ||
      typeof values[0] !== "boolean" ||
      typeof values[1] !== "number" ||
      !Number.isInteger(values[1]) ||
      values[1] < 0 ||
      values[1] > 10
    ) {
      console.error(
        `[DragonMounts2] Invalid world settings response: ${JSON.stringify(values)}`,
      );
      player.sendMessage({
        rawtext: [
          { text: "§c" },
          { translate: "tooltip.dragonmounts2:settings.save_failed" },
        ],
      });
      return;
    }
    if (!canEditWorldSettings(player)) {
      player.sendMessage({
        rawtext: [
          { text: "§c" },
          { translate: "tooltip.dragonmounts2:settings.host_only" },
        ],
      });
      showSettings(player);
      return;
    }
    const effectsSaved = settings.setWorldEnvironmentalEffectsEnabled(values[0]);
    const hatchSpeedSaved = settings.setWorldDragonEggHatchSpeed(
      (values[1] + 10) / 10,
    );
    const saved = effectsSaved && hatchSpeedSaved;
    player.sendMessage({
      rawtext: [
        { text: saved ? "§a" : "§c" },
        {
          translate: saved
            ? "tooltip.dragonmounts2:settings.saved"
            : "tooltip.dragonmounts2:settings.save_failed",
        },
      ],
    });
    showSettings(player);
  });
}

function showSettings(player) {
  if (!(player instanceof Player) || !player.isValid) return;

  try {
    const form = new ActionFormData()
      .title({ translate: "tooltip.dragonmounts2:settings.title" })
      .body({ translate: "tooltip.dragonmounts2:settings.browse_description" })
      .header({ translate: "tooltip.dragonmounts2:settings.categories" })
      .divider()
      .button(
        { translate: "tooltip.dragonmounts2:settings.player_card" },
        "textures/ui/dragonmounts2/dragon_development/configurables",
      );
    if (canEditWorldSettings(player)) {
      form.button(
        { translate: "tooltip.dragonmounts2:settings.world_card" },
        "textures/ui/dragonmounts2/dragon_development/op_configurables",
      );
    }

    system.runTimeout(() => {
      if (!player.isValid) return;
      form
        .show(player)
        .then((result) => {
          if (result.canceled || result.selection === undefined) return;
          if (result.selection === 0) {
            showPlayerSettings(player);
          } else if (result.selection === 1 && canEditWorldSettings(player)) {
            showWorldSettings(player);
          }
        })
        .catch((error) =>
          console.error(
            `[DragonMounts2] Settings menu failed: ${error?.message ?? error}`,
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
  system.runTimeout(() => applyOwnedDragonCollars(player), 2);
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
      description: "Open DragonMounts2 settings.",
      permissionLevel: 1,
      cheatsRequired: false,
    },
    (origin) => {
      showSettings(getPlayer(origin));
    },
  );
}
