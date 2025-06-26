
scoreboard players add @e[type=dragonmounts:fire_dragon_egg] Timer 1

scoreboard players add @e[type=dragonmounts:aether_dragon_egg] Timer 1

scoreboard players add @e[type=dragonmounts:ice_dragon_egg] Timer 1

scoreboard players add @e[type=dragonmounts:nether_dragon_egg] Timer 1

scoreboard players add @e[type=dragonmounts:water_dragon_egg] Timer 1

scoreboard players add @e[type=dragonmounts:skeleton_dragon_egg] Timer 1

scoreboard players add @e[type=dragonmounts:wither_dragon_egg] Timer 1

scoreboard players add @e[type=dragonmounts:ender_dragon_egg] Timer 1

scoreboard players add @e[type=dragonmounts:enchant_dragon_egg] Timer 1

scoreboard players add @e[type=dragonmounts:forest_dragon_egg] Timer 1

scoreboard players add @e[type=dragonmounts:zombie_dragon_egg] Timer 1

scoreboard players add @e[type=dragonmounts:storm_dragon_egg] Timer 1

scoreboard players add @e[type=dragonmounts:sunlight_dragon_egg] Timer 1

scoreboard players add @e[type=dragonmounts:moonlight_dragon_egg] Timer 1

scoreboard players add @e[type=dragonmounts:terra_dragon_egg] Timer 1

scoreboard players add @e[type=dragonmounts:dark_dragon_egg] Timer 1

tag @e[family=dragon] remove flying 
tag @e[family=dragon] remove to_catch_player
tag @a remove can_catch
execute @e[tag=flying,family=dragon] ~ ~ ~ effect @s slow_falling 1 1 true
