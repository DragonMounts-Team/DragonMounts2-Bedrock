import { system, CustomCommandParamType } from "@minecraft/server";

function isValidEntity(entity) {
	return entity?.isValid === true;
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

function tameEntities(targetEntities, ownerEntities) {
	const owner = normalizeEntities(ownerEntities)[0];
	if (!owner) {
		return { success: false, message: "No valid owner entity was provided." };
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
			console.error(`[DragonMounts2] Failed to tame entity ${entity?.typeId ?? "unknown"}: ${error?.message ?? error}`);
		}
	}

	if (tamedCount === 0) {
		return { success: false, message: "No tameable entities were found to tame." };
	}

	return { success: true, tamedCount };
}

function registerBuiltInCommands(customCommandRegistry) {
	customCommandRegistry.registerCommand(
		{
			name: "dragonmounts2:tame",
			description: "Tames one or more entities and assigns them to an owner entity.",
			permissionLevel: 1,
			cheatsRequired: true,
			mandatoryParameters: [
				{ type: CustomCommandParamType.EntitySelector, name: "target" },
				{ type: CustomCommandParamType.EntitySelector, name: "owner" },
			],
		},
		(args, sender) => {
			const targets = normalizeEntities(args[0]);
			const owners = normalizeEntities(args[1]);

			if (targets.length === 0) {
				sender.sendMessage("No valid entities were found to tame.");
				return;
			}

			if (owners.length === 0) {
				sender.sendMessage("No valid owner entity was found.");
				return;
			}

			const result = tameEntities(targets, owners);
			if (!result.success) {
				sender.sendMessage(result.message);
				return;
			}

			sender.sendMessage(`Tamed ${result.tamedCount} entity${result.tamedCount === 1 ? "" : "ies"}.`);
		}
	);
}

export function initDragonMounts2Commands() {
	system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
		registerBuiltInCommands(customCommandRegistry);
	});
}

initDragonMounts2Commands();
