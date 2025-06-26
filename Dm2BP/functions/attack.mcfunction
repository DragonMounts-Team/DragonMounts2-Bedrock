tag @e[r=2.5,c=1,family=dragon] add no_attack

playsound mob.mountdragon.attack.eat @a ~ ~ ~ 1 1      
execute @s ^ ^-1 ^3 damage @e[r=1.8,c=1,tag=!no_attack] 12 entity_attack
execute @s ^ ^-1 ^4 damage @e[r=1.8,c=1,tag=!no_attack] 12 entity_attack

tag @e[r=2.5,c=1,family=dragon] remove no_attack
