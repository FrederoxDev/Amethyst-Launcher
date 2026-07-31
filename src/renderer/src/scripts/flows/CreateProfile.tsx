import { NewInstancePopup, NewInstanceResult } from "@renderer/popups/NewInstancePopup";
import { VersionChoice, VersionPickerPopup } from "@renderer/popups/VersionPickerPopup";
import { Channel } from "@renderer/scripts/domain/Channel";
import { Profile } from "@renderer/scripts/domain/Profile";
import { useAppStore } from "@renderer/states/AppStore";
import { Popup } from "@renderer/states/PopupStore";
import { startPendingImport } from "./VersionChoice";

export interface CreatedProfile {
    profile: Profile;
    index: number;
}

async function pickVersion(restrictToChannel?: Channel): Promise<VersionChoice | null> {
    return Popup.useAsync<VersionChoice | null>(props => (
        <VersionPickerPopup {...props} restrictToChannel={restrictToChannel} />
    ));
}

/** Version -> name/runtime -> profile. Returns null if the user backed out. */
export async function createProfileFlow(restrictToChannel?: Channel): Promise<CreatedProfile | null> {
    let choice = await pickVersion(restrictToChannel);
    if (!choice) return null;

    while (true) {
        const instance = await Popup.useAsync<NewInstanceResult | null>(props => (
            <NewInstancePopup {...props} versionLabel={choice!.label} channel={choice!.channel} />
        ));
        if (!instance) return null;

        if (instance.kind === "reselect") {
            const next = await pickVersion(restrictToChannel);
            if (!next) return null;
            choice = next;
            continue;
        }

        startPendingImport(choice);

        const state = useAppStore.getState();
        const profile: Profile = {
            uuid: crypto.randomUUID(),
            name: instance.name,
            channel: choice.channel,
            versionUuid: choice.versionUuid,
            versionLabel: choice.label,
            runtime: "Vanilla",
            mods: [],
        };

        const profiles = [...state.profiles, profile];
        state.setProfiles(profiles);
        state.setEditingProfileIndex(profiles.length - 1);
        state.saveData();

        return { profile, index: profiles.length - 1 };
    }
}
