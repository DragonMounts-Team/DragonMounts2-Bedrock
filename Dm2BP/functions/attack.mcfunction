tag @e[r=5,c=1,family=dragon] add no_attack

playsound mob.mountdragon.attack.eat @a ~ ~ ~ 1 1      
execute positioned ^ ^-1 ^5 run damage @e[r=1.8,c=1,tag=!no_attack] 12 entity_attack
execute positioned ^ ^-1 ^6 run damage @e[r=1.8,c=1,tag=!no_attack] 12 entity_attack

tag @e[r=5,c=1,family=dragon] remove no_attack
