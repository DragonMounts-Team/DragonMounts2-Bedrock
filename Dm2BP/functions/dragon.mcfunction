tag @e[family=dragon] remove flying 
tag @e[family=dragon] remove to_catch_player
tag @a remove can_catch
execute @e[tag=flying,family=dragon] ~ ~ ~ effect @s slow_falling 1 1 true 
effect @e[hasitem={item=dm2:dragonarmor_diamond,location=slot.equippable}] resistance 5 3
effect @e[hasitem={item=dm2:dragonarmor_emerald,location=slot.equippable}] resistance 5 2
effect @e[hasitem={item=dm2:dragonarmor_iron,location=slot.equippable}] resistance 5 1
effect @e[hasitem={item=dm2:dragonarmor_gold,location=slot.equippable}] resistance 5 0