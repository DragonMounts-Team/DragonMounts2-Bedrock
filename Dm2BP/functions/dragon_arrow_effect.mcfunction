execute @a[tag=aether_1,tag=aether_2,tag=aether_3,tag=aether_4] ~ ~ ~ function armor/aether_effect
execute @a[tag=enchant_1,tag=enchant_2,tag=enchant_3,tag=enchant_4] ~ ~ ~ function armor/enchant_effect
execute @a[tag=ender_1,tag=ender_2,tag=ender_3,tag=ender_4] ~ ~ ~ function armor/ender_effect
execute @a[tag=fire_1,tag=fire_2,tag=fire_3,tag=fire_4] ~ ~ ~ function armor/fire_effect
execute @a[tag=forest_1,tag=forest_2,tag=forest_3,tag=forest_4] ~ ~ ~ function armor/forest_effect
execute @a[tag=ice_1,tag=ice_2,tag=ice_3,tag=ice_4] ~ ~ ~ function armor/ice_effect
execute @a[tag=moonlight_1,tag=moonlight_2,tag=moonlight_3,tag=moonlight_4] ~ ~ ~ function armor/moonlight_effect
execute @a[tag=nether_1,tag=nether_2,tag=nether_3,tag=nether_4] ~ ~ ~ function armor/nether_effect
execute @a[tag=terra_1,tag=terra_2,tag=terra_3,tag=terra_4] ~ ~ ~ function armor/terra_effect
execute @a[tag=water_1,tag=water_2,tag=water_3,tag=water_4] ~ ~ ~ function armor/water_effect
execute @a[tag=zombie_1,tag=zombie_2,tag=zombie_3,tag=zombie_4] ~ ~ ~ function armor/zombie_effect 
execute @a[tag=storm_1,tag=storm_2,tag=storm_3,tag=storm_4] ~ ~ ~ function armor/storm_effect 
execute @a[tag=dark_1,tag=dark_2,tag=dark_3,tag=dark_4] ~ ~ ~ function armor/dark_effect 
execute @a[tag=sunlight_1,tag=sunlight_2,tag=sunlight_3,tag=sunlight_4] ~ ~ ~ function armor/sunlight_effect
execute @a[tag=sculk_1,tag=sculk_2,tag=sculk_3,tag=sculk_4] ~ ~ ~ function armor/sculk_effect

tag @a remove sculk_1
tag @a remove sculk_2
tag @a remove sculk_3
tag @a remove sculk_4
tag @a remove aether_1
tag @a remove aether_2
tag @a remove aether_3
tag @a remove aether_4
tag @a remove enchant_1
tag @a remove enchant_2
tag @a remove enchant_3
tag @a remove enchant_4
tag @a remove ender_1
tag @a remove ender_2
tag @a remove ender_3
tag @a remove ender_4
tag @a remove fire_1
tag @a remove fire_2
tag @a remove fire_3
tag @a remove fire_4
tag @a remove forest_1
tag @a remove forest_2
tag @a remove forest_3
tag @a remove forest_4
tag @a remove ice_1
tag @a remove ice_2
tag @a remove ice_3
tag @a remove ice_4
tag @a remove moonlight_1
tag @a remove moonlight_2
tag @a remove moonlight_3
tag @a remove moonlight_4
tag @a remove nether_1
tag @a remove nether_2
tag @a remove nether_3
tag @a remove nether_4

tag @a remove storm_1
tag @a remove storm_2
tag @a remove storm_3
tag @a remove storm_4
tag @a remove sunlight_1
tag @a remove sunlight_2
tag @a remove sunlight_3
tag @a remove sunlight_4
tag @a remove terra_1
tag @a remove terra_2
tag @a remove terra_3
tag @a remove terra_4
tag @a remove water_1
tag @a remove water_2
tag @a remove water_3
tag @a remove water_4
tag @a remove zombie_1
tag @a remove zombie_2
tag @a remove zombie_3
tag @a remove zombie_4
execute @e[family=ice_dragon] ~ ~ ~ fill ~4 ~4 ~4 ~-4 ~-4 ~-4 obsidian 0 replace lava
execute @e[family=ice_dragon] ~ ~ ~ fill ~4 ~4 ~4 ~-4 ~-4 ~-4 air 0 replace fire
execute @e[family=ice_dragon] ~ ~ ~ fill ~4 ~4 ~4 ~-4 ~-4 ~-4 frosted_ice 0 replace water
tag @a remove dark_1
tag @a remove dark_2
tag @a remove dark_3
tag @a remove dark_4
