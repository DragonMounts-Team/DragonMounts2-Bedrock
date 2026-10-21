import {
  CustomCommandParamType,
  CustomCommandStatus,
  Player,
  system,
  world,
} from "@minecraft/server";
import { dragonTypeIds } from "../data/entity_data.js";
import { registerSettingsCommand } from "./settings_modules.js";
import * as dragonUtilities from "../utilities/dragon_utilities.js";

function isValidEntity(entity) {
  return entity?.isValid === true;
}

function getCommandPlayer(origin) {
  if (origin instanceof Player) return origin;
  const player = origin?.sourceEntity ?? origin?.initiator ?? origin?.entity;
  if (player instanceof Player) return player;
  const playerId = origin?.id ?? player?.id;
  return playerId
    ? (world.getAllPlayers().find((candidate) => candidate.id === playerId) ??
        null)
    : null;
}

function normalizeEntities(value) {
  if (Array.isArray(value)) {
    return value.filter(isValidEntity);
  }

  if (value && typeof value === "object") {
    if (Array.isArray(value.entities)) {
      return value.entities.filter(isValidEntity);
    }

    return isValidEntity(value) ? [value] : [];
  }

  return [];
}

function say(origin, key, ...values) {
  const source = origin?.sourceEntity;
  if (source instanceof Player) {
    source.sendMessage({
      rawtext: [{ translate: key, with: values.map(String) }],
    });
  }
}

function fail(origin, key) {
  say(origin, key);
  return {
    status: CustomCommandStatus.Failure,
    message: "Command failed. See chat for details.",
  };
}

function tameEntities(targetEntities, ownerEntities) {
  const owner = normalizeEntities(ownerEntities)[0];
  if (!owner) {
    return { success: false, key: "tooltip.dragonmounts2:command.no_owner" };
  }

  const ownerName = owner.name ?? owner.typeId ?? "Unknown";
  const ownerId = owner.id ?? "";
  let tamedCount = 0;
  for (const entity of normalizeEntities(targetEntities)) {
    if (!entity?.isValid) {
      continue;
    }

    try {
      entity.triggerEvent?.("minecraft:on_tame");
      if (entity.setDynamicProperty) {
        entity.setDynamicProperty("dragonmounts2:owner_identifier", ownerId);
        entity.setDynamicProperty("dragonmounts2:owner_name", ownerName);
      }
      tamedCount += 1;
    } catch (error) {
      console.error(
        `[DragonMounts2] Failed to tame entity ${entity?.typeId ?? "unknown"}: ${error?.message ?? error}`,
      );
    }
  }

  if (tamedCount === 0) {
    return {
      success: false,
      key: "tooltip.dragonmounts2:command.no_tameable",
    };
  }

  return { success: true, tamedCount };
}

function registerBuiltInCommands(customCommandRegistry) {
  customCommandRegistry.registerCommand(
    {
      name: "dragonmounts2:tame",
      description: "Tame selected entities and assign them to an owner.",
      permissionLevel: 1,
      cheatsRequired: true,
      mandatoryParameters: [
        { type: CustomCommandParamType.EntitySelector, name: "target" },
        { type: CustomCommandParamType.EntitySelector, name: "owner" },
      ],
    },
    (origin, target, owner) => {
      const targets = normalizeEntities(target);
      const owners = normalizeEntities(owner);
      if (targets.length === 0) return fail(origin, "tooltip.dragonmounts2:command.no_entities");
      if (owners.length === 0) return fail(origin, "tooltip.dragonmounts2:command.no_owner");
      const result = tameEntities(targets, owners);
      if (!result.success) return fail(origin, result.key);
      say(origin, "tooltip.dragonmounts2:command.tame.success", result.tamedCount);
      return { status: CustomCommandStatus.Success };
    },
  );
                                                                                  
                                                                   
  customCommandRegistry.registerCommand(
    {
      name: "dragonmounts2:trust",
      description: "Set whether dragons skip the break-in ride.",
      permissionLevel: 1,
      cheatsRequired: true,
      mandatoryParameters: [
        { type: CustomCommandParamType.EntitySelector, name: "targets" },
      ],
      optionalParameters: [
        { type: CustomCommandParamType.Boolean, name: "value" },
      ],
    },
    (origin, targets, value) => {
      const dragons = normalizeEntities(targets).filter((entity) =>
        dragonTypeIds.has(entity.typeId),
      );
      if (dragons.length === 0) return fail(origin, "tooltip.dragonmounts2:command.no_dragons");
      const trusted = value !== false;
      system.run(() => {
        for (const dragon of dragons) {
          dragonUtilities.setBreakInTrusted(dragon, trusted);
        }
      });
      say(origin, trusted ? "tooltip.dragonmounts2:command.trust.granted" : "tooltip.dragonmounts2:command.trust.removed", dragons.length);
      return { status: CustomCommandStatus.Success };
    },
  );
  registerSettingsCommand(customCommandRegistry);
  const toggleDebug = (origin) => {
    const player = getCommandPlayer(origin);
    if (player) dragonUtilities.toggleFlightDebug(player);
  };
  customCommandRegistry.registerCommand(
    {
      name: "dragonmounts2:debug",
      description: "Toggle dragon flight speed debugging.",
      permissionLevel: 0,
      cheatsRequired: false,
    },
    toggleDebug,
  );
}

export function registerDragonMounts2Commands(customCommandRegistry) {
  registerBuiltInCommands(customCommandRegistry);
}
