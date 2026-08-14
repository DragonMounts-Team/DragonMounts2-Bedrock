import { registerCustomComponent } from "../../register";

const COMPONENT_ID = "custom:on_use";
registerCustomComponent(COMPONENT_ID, {
    onUse(e, { params }) {
        const { source, itemStack } = e;
        if (!source?.isValid || !itemStack) return;
        if (!source.matches({ type: "minecraft:player" })) return;

        const { trigger } = params;
        components.onUse[trigger](e);
    },
});

