# 1.21
execute at @e[type=dragonmountsplus:enchant_dragon_egg,scores={Timer=6000}] if block ~ ~-1 ~ oak_log if block ~1 ~-1 ~ oak_log if block ~-1 ~-1 ~ oak_log if block ~ ~-1 ~1 oak_log if block ~ ~-1 ~-1 oak_log if block ~1 ~-1 ~1 oak_log if block ~-1 ~-1 ~1 oak_log if block ~1 ~-1 ~-1 oak_log if block ~-1 ~-1 ~-1 oak_log run function egg/forest

# 1.17
execute @e[type=dragonmountsplus:enchant_dragon_egg,scores={Timer=6000}] ~~~ detect ~ ~-1 ~ oak_log 0 execute @s ~ ~ ~ detect ~1 ~-1 ~ oak_log 0 execute @s ~ ~ ~ detect ~-1 ~-1 ~ oak_log 0 execute @s ~ ~ ~ detect ~ ~-1 ~1 oak_log 0 execute @s ~ ~ ~ detect ~ ~-1 ~-1 oak_log 0 execute @s ~ ~ ~ detect ~1 ~-1 ~1 oak_log 0 execute @s ~ ~ ~ detect ~-1 ~-1 ~1 oak_log 0 execute @s ~ ~ ~ detect ~1 ~-1 ~-1 oak_log 0 execute @s ~ ~ ~ detect ~-1 ~-1 ~-1 oak_log 0 function egg/forest
