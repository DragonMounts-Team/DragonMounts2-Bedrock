playsound mob.dragonegg.back_to_block @a ~ ~ ~ 1 1
execute unless block ~ ~ ~ air run loot spawn ~~~ loot "blocks/aether"
execute if block ~ ~ ~ air run setblock ~~~ dragonmountsplus:aether_dragon_egg
tp @e[r=0.1,family=dragon_egg] ~ -70 ~