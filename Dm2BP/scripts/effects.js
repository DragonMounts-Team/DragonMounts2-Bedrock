import { world, system, EquipmentSlot } from "@minecraft/server";

function armor() {
  for (const player of world.getPlayers()) {
    const eq = player.getComponent("minecraft:equippable");
    if (!eq) continue;

    const head  = eq.getEquipment(EquipmentSlot.Head);
    const chest = eq.getEquipment(EquipmentSlot.Chest);
    const legs  = eq.getEquipment(EquipmentSlot.Legs);
    const feet  = eq.getEquipment(EquipmentSlot.Feet);

    //water
    if (
      head?.typeId  === "dragonmountsplus:water_dragonscale_helmet" &&
      chest?.typeId === "dragonmountsplus:water_dragonscale_chestplate" &&
      legs?.typeId  === "dragonmountsplus:water_dragonscale_leggings" &&
      feet?.typeId  === "dragonmountsplus:water_dragonscale_boots"
    ) {
      player.addEffect("water_breathing", 2, { amplifier: 3 });
      }
    //nether
    if (
      head?.typeId  === "dragonmountsplus:nether_dragonscale_helmet" &&
      chest?.typeId === "dragonmountsplus:nether_dragonscale_chestplate" &&
      legs?.typeId  === "dragonmountsplus:nether_dragonscale_leggings" &&
      feet?.typeId  === "dragonmountsplus:nether_dragonscale_boots"
    ) {
      player.addEffect("fire_resistance", 2, { amplifier: 0 });
      }
    //dark
    if (
      head?.typeId  === "dragonmountsplus:dark_dragonscale_helmet" &&
      chest?.typeId === "dragonmountsplus:dark_dragonscale_chestplate" &&
      legs?.typeId  === "dragonmountsplus:dark_dragonscale_leggings" &&
      feet?.typeId  === "dragonmountsplus:dark_dragonscale_boots"
    ) {
      player.addEffect("resistance", 2, { amplifier: 1 });
    }
    //terra
    if (
      head?.typeId  === "dragonmountsplus:terra_dragonscale_helmet" &&
      chest?.typeId === "dragonmountsplus:terra_dragonscale_chestplate" &&
      legs?.typeId  === "dragonmountsplus:terra_dragonscale_leggings" &&
      feet?.typeId  === "dragonmountsplus:terra_dragonscale_boots"
    ) {
      player.addEffect("haste", 2, { amplifier: 1 }); 
    }
    //storm
    if (
      head?.typeId  === "dragonmountsplus:storm_dragonscale_helmet" &&
      chest?.typeId === "dragonmountsplus:storm_dragonscale_chestplate" &&
      legs?.typeId  === "dragonmountsplus:storm_dragonscale_leggings" &&
      feet?.typeId  === "dragonmountsplus:storm_dragonscale_boots"
    ) {
      player.addEffect("slow_falling", 2, { amplifier: 0 }); 
      }
      //sculk
    if (
      head?.typeId  === "dragonmountsplus:sculk_dragonscale_helmet" &&
      chest?.typeId === "dragonmountsplus:sculk_dragonscale_chestplate" &&
      legs?.typeId  === "dragonmountsplus:sculk_dragonscale_leggings" &&
      feet?.typeId  === "dragonmountsplus:sculk_dragonscale_boots"
    ) {
      player.addEffect("resistance", 2, { amplifier: 3 }); 
    }
    //sunlight
    if (
      head?.typeId  === "dragonmountsplus:sunlight_dragonscale_helmet" &&
      chest?.typeId === "dragonmountsplus:sunlight_dragonscale_chestplate" &&
      legs?.typeId  === "dragonmountsplus:sunlight_dragonscale_leggings" &&
      feet?.typeId  === "dragonmountsplus:sunlight_dragonscale_boots"
    ) {
      player.addEffect("regeneration", 2, { amplifier: 0 }); 
    }
    //moonlight
    if (
      head?.typeId  === "dragonmountsplus:moonlight_dragonscale_helmet" &&
      chest?.typeId === "dragonmountsplus:moonlight_dragonscale_chestplate" &&
      legs?.typeId  === "dragonmountsplus:moonlight_dragonscale_leggings" &&
      feet?.typeId  === "dragonmountsplus:moonlight_dragonscale_boots"
    ) {
      player.addEffect("night_vision", 16, { amplifier: 0 }); 
    }
    //ender
    if (
      head?.typeId  === "dragonmountsplus:ender_dragonscale_helmet" &&
      chest?.typeId === "dragonmountsplus:ender_dragonscale_chestplate" &&
      legs?.typeId  === "dragonmountsplus:ender_dragonscale_leggings" &&
      feet?.typeId  === "dragonmountsplus:ender_dragonscale_boots"
    ) {
      player.addEffect("resistance", 2, { amplifier: 2 });
      player.addEffect("strength", 2, { amplifier: 1 });
    }
    //fire
    if (
      head?.typeId  === "dragonmountsplus:fire_dragonscale_helmet" &&
      chest?.typeId === "dragonmountsplus:fire_dragonscale_chestplate" &&
      legs?.typeId  === "dragonmountsplus:fire_dragonscale_leggings" &&
      feet?.typeId  === "dragonmountsplus:fire_dragonscale_boots"
    ) {
      player.addEffect("fire_resistance", 2, { amplifier: 0 });
    }
    //forest
    if (
      head?.typeId  === "dragonmountsplus:forest_dragonscale_helmet" &&
      chest?.typeId === "dragonmountsplus:forest_dragonscale_chestplate" &&
      legs?.typeId  === "dragonmountsplus:forest_dragonscale_leggings" &&
      feet?.typeId  === "dragonmountsplus:forest_dragonscale_boots"
    ) {
      player.addEffect("regeneration", 2, { amplifier: 0 });
    }
    //zombie
    if (
      head?.typeId  === "dragonmountsplus:zombie_dragonscale_helmet" &&
      chest?.typeId === "dragonmountsplus:zombie_dragonscale_chestplate" &&
      legs?.typeId  === "dragonmountsplus:zombie_dragonscale_leggings" &&
      feet?.typeId  === "dragonmountsplus:zombie_dragonscale_boots"
    ) {
      player.addEffect("strength", 2, { amplifier: 2 });
    }
    //aether
    if (
      head?.typeId  === "dragonmountsplus:aether_dragonscale_helmet" &&
      chest?.typeId === "dragonmountsplus:aether_dragonscale_chestplate" &&
      legs?.typeId  === "dragonmountsplus:aether_dragonscale_leggings" &&
      feet?.typeId  === "dragonmountsplus:aether_dragonscale_boots"
    ) {
      player.addEffect("speed", 1, { amplifier: 2 });
    }
  }

  // run every tick
  system.run(armor);
}

// Start the loop
system.run(armor);
