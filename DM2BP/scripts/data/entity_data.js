export const dragonVariantDenyTypes = {
	//"dragonmounts2:fire_dragon": "blue"//Rare variants have been deprecated so unless you wanna add something here, then this is a backup.
};

export const dragonEggTypes = {
	"dragonmounts2:aether_dragon_egg": {
		"hatch_method": "radius",
		"egg_type": "dragonmounts2:aether_dragon_egg",
		"deny": "dragonmounts2:aether_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:glowstone" ],
				"start_xz_locations": { "x": -1, "z": -1 },
				"end_xz_locations": { "x": 1, "z": 1 },
				"y_location": -1
			}
		}
	},
	"dragonmounts2:dark_dragon_egg": {
		"hatch_method": "radius",
		"egg_type": "dragonmounts2:dark_dragon_egg",
		"deny": "dragonmounts2:dark_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:obsidian" ],
				"start_xz_locations": { "x": -1, "z": -1 },
				"end_xz_locations": { "x": 1, "z": 1 },
				"y_location": -1
			}
		}
	},
	"dragonmounts2:enchanted_dragon_egg": {
		"hatch_method": "single",
		"egg_type": "dragonmounts2:enchanted_dragon_egg",
		"deny": "dragonmounts2:enchanted_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:bookshelf" ],
				"location": { "x": 0, "y": -1, "z": 0 }
			}
		}
	},
	"dragonmounts2:ender_dragon_egg": {
		"hatch_method": "radius",
		"egg_type": "dragonmounts2:ender_dragon_egg",
		"deny": "dragonmounts2:ender_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:end_stone" ],
				"start_xz_locations": { "x": -1, "z": -1 },
				"end_xz_locations": { "x": 1, "z": 1 },
				"y_location": -1
			}
		}
	},
	"dragonmounts2:fire_dragon_egg": {
		"hatch_method": "ring",
		"egg_type": "dragonmounts2:fire_dragon_egg",
		"deny": "dragonmounts2:fire_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:fire" ],
				"xz_locations": [
					{ "x": -1, "z": -1 },
					{ "x": 0, "z": -1 },
					{ "x": 1, "z": -1 },
					{ "x": -1, "z": 0 },
					{ "x": 1, "z": 0 },
					{ "x": -1, "z": 1 },
					{ "x": 0, "z": 1 },
					{ "x": 1, "z": 1 }
				],
				"y_location": 0
			},
			"second_method": {
				"blocks": [ "minecraft:lava", "minecraft:flowing_lava" ],
				"xz_locations": [
					{ "x": -1, "z": -1 },
					{ "x": 0, "z": -1 },
					{ "x": 1, "z": -1 },
					{ "x": -1, "z": 0 },
					{ "x": 1, "z": 0 },
					{ "x": -1, "z": 1 },
					{ "x": 0, "z": 1 },
					{ "x": 1, "z": 1 }
				],
				"y_location": -1
			}
		}
	},
	"dragonmounts2:forest_dragon_egg": {
		"hatch_method": "radius",
		"egg_type": "dragonmounts2:forest_dragon_egg",
		"deny": "dragonmounts2:forest_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:oak_leaves", "minecraft:spruce_leaves", "minecraft:birch_leaves", "minecraft:jungle_leaves", "minecraft:acacia_leaves", "minecraft:dark_oak_leaves", "minecraft:mangrove_leaves", "minecraft:cherry_leaves", "minecraft:pale_oak_leaves", "minecraft:azalea_leaves", "minecraft:azalea_leaves_flowered" ],
				"tags": [ "log" ],
				"start_xz_locations": { "x": -1, "z": -1 },
				"end_xz_locations": { "x": 1, "z": 1 },
				"y_location": -1
			}
		}
	},
	"dragonmounts2:ice_dragon_egg": {
		"hatch_method": "radius",
		"egg_type": "dragonmounts2:ice_dragon_egg",
		"deny": "dragonmounts2:ice_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:frosted_ice", "minecraft:ice", "minecraft:packed_ice", "minecraft:blue_ice", "minecraft:snow", "minecraft:powder_snow" ],
				"start_xz_locations": { "x": -1, "z": -1 },
				"end_xz_locations": { "x": 1, "z": 1 },
				"y_location": -1
			}
		}
	},
	"dragonmounts2:light_dragon_egg": {
		"hatch_method": "radius",
		"egg_type": "dragonmounts2:light_dragon_egg",
		"deny": "dragonmounts2:light_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:quartz_block" ],
				"start_xz_locations": { "x": -1, "z": -1 },
				"end_xz_locations": { "x": 1, "z": 1 },
				"y_location": -1
			}
		}
	},
	"dragonmounts2:moonlight_dragon_egg": {
		"hatch_method": "single",
		"egg_type": "dragonmounts2:moonlight_dragon_egg",
		"deny": "dragonmounts2:moonlight_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:daylight_detector_inverted" ],
				"location": { "x": 0, "y": -1, "z": 0 }
			}
		}
	},
	"dragonmounts2:nether_dragon_egg": {
		"hatch_method": "radius",
		"egg_type": "dragonmounts2:nether_dragon_egg",
		"deny": "dragonmounts2:nether_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:magma" ],
				"start_xz_locations": { "x": -1, "z": -1 },
				"end_xz_locations": { "x": 1, "z": 1 },
				"y_location": -1
			}
		}
	},
	"dragonmounts2:sculk_dragon_egg": {
		"hatch_method": "radius",
		"egg_type": "dragonmounts2:sculk_dragon_egg",
		"deny": "dragonmounts2:sculk_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:sculk" ],
				"start_xz_locations": { "x": -1, "z": -1 },
				"end_xz_locations": { "x": 1, "z": 1 },
				"y_location": -1
			},
			"second_method": {
				"blocks": [ "minecraft:sculk_catalyst" ],
				"start_xz_locations": { "x": 0, "z": 0 },
				"end_xz_locations": { "x": 0, "z": 0 },
				"y_location": -1
			}
		}
	},
	"dragonmounts2:skeleton_dragon_egg": {
		"hatch_method": "radius",
		"egg_type": "dragonmounts2:skeleton_dragon_egg",
		"deny": "dragonmounts2:skeleton_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:bone_block" ],
				"start_xz_locations": { "x": -1, "z": -1 },
				"end_xz_locations": { "x": 1, "z": 1 },
				"y_location": -1
			}
		}
	},
	"dragonmounts2:storm_dragon_egg": {
		"hatch_method": "single",
		"egg_type": "dragonmounts2:storm_dragon_egg",
		"deny": "dragonmounts2:storm_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:lightning_rod", "minecraft:exposed_lightning_rod", "minecraft:weathered_lightning_rod", "minecraft:oxidized_lightning_rod", "minecraft:waxed_lightning_rod", "minecraft:waxed_exposed_lightning_rod", "minecraft:waxed_weathered_lightning_rod", "minecraft:waxed_oxidized_lightning_rod" ],
				"location": { "x": 0, "y": -1, "z": 0 }
			}
		}
	},
	"dragonmounts2:sunlight_dragon_egg": {
		"hatch_method": "single",
		"egg_type": "dragonmounts2:sunlight_dragon_egg",
		"deny": "dragonmounts2:sunlight_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:daylight_detector" ],
				"location": { "x": 0, "y": -1, "z": 0 }
			}
		}
	},
	"dragonmounts2:terra_dragon_egg": {
		"hatch_method": "radius",
		"egg_type": "dragonmounts2:terra_dragon_egg",
		"deny": "dragonmounts2:terra_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:sand", "minecraft:red_sand" ],
				"start_xz_locations": { "x": -1, "z": -1 },
				"end_xz_locations": { "x": 1, "z": 1 },
				"y_location": -1
			}
		}
	},
	"dragonmounts2:water_dragon_egg": {
		"hatch_method": "ring",
		"egg_type": "dragonmounts2:water_dragon_egg",
		"deny": "dragonmounts2:water_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:water", "minecraft:flowing_water" ],
				"xz_locations": [
					{ "x": -1, "z": -1 },
					{ "x": 0, "z": -1 },
					{ "x": 1, "z": -1 },
					{ "x": -1, "z": 0 },
					{ "x": 1, "z": 0 },
					{ "x": -1, "z": 1 },
					{ "x": 0, "z": 1 },
					{ "x": 1, "z": 1 }
				],
				"y_location": -1
			}
		}
	},
	"dragonmounts2:wither_dragon_egg": {
		"hatch_method": "ring",
		"egg_type": "dragonmounts2:wither_dragon_egg",
		"deny": "dragonmounts2:wither_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:wither_rose" ],
				"xz_locations": [
					{ "x": -1, "z": -1 },
					{ "x": 0, "z": -1 },
					{ "x": 1, "z": -1 },
					{ "x": -1, "z": 0 },
					{ "x": 1, "z": 0 },
					{ "x": -1, "z": 1 },
					{ "x": 0, "z": 1 },
					{ "x": 1, "z": 1 }
				],
				"y_location": 0
			}
		}
	},
	"dragonmounts2:zombie_dragon_egg": {
		"hatch_method": "radius",
		"egg_type": "dragonmounts2:zombie_dragon_egg",
		"deny": "dragonmounts2:zombie_dragon_egg",
		"block_placement": {
			"first_method": {
				"blocks": [ "minecraft:mossy_cobblestone", "minecraft:nether_wart_block", "minecraft:soul_sand", "minecraft:soul_soil" ],
				"start_xz_locations": { "x": -1, "z": -1 },
				"end_xz_locations": { "x": 1, "z": 1 },
				"y_location": -1
			}
		}
	}
};