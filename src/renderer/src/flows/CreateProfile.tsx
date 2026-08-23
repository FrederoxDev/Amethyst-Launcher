import { NewInstancePopup, NewInstanceResult } from "@renderer/popups/NewInstancePopup";
import { VersionChoice, VersionPickerPopup } from "@renderer/popups/VersionPickerPopup";
import { Channel } from "@renderer/scripts/domain/Channel";
import { Profile } from "@renderer/scripts/domain/Profile";
import { log } from "@renderer/scripts/LauncherLog";
import { useAppStore } from "@renderer/states/AppStore";
import { Popup } from "@renderer/states/PopupStore";
import { startPendingImport } from "./VersionChoice";

export interface CreatedProfile {
    profile: Profile;
    index: number;
}

async function pickVersion(restrictToChannel?: Channel): Promise<VersionChoice | null> {
    return Popup.ask<VersionChoice | null>(props => (
        <VersionPickerPopup {...props} restrictToChannel={restrictToChannel} />
    ));
}

/** Version -> name/runtime -> profile. Returns null if the user backed out. */
export async function createProfileFlow(restrictToChannel?: Channel): Promise<CreatedProfile | null> {
    log("CreateProfile", `Profile creation started${restrictToChannel ? `, limited to ${restrictToChannel}` : ""}`);

    let choice = await pickVersion(restrictToChannel);
    if (!choice) {
        log("CreateProfile", "Cancelled at the version picker");
        return null;
    }
    log("CreateProfile", `Version picked: "${choice.label}" (${choice.versionUuid}, ${choice.channel})`);

    while (true) {
        const instance = await Popup.ask<NewInstanceResult | null>(props => (
            <NewInstancePopup {...props} versionLabel={choice!.label} channel={choice!.channel} />
        ));
        if (!instance) {
            log("CreateProfile", `Cancelled at the instance details for "${choice.label}"`);
            return null;
        }

        if (instance.kind === "reselect") {
            log("CreateProfile", `Going back to the version picker from "${choice.label}"`);
            const next = await pickVersion(restrictToChannel);
            if (!next) {
                log("CreateProfile", "Cancelled at the version picker on reselect");
                return null;
            }
            choice = next;
            log("CreateProfile", `Version reselected: "${choice.label}" (${choice.versionUuid}, ${choice.channel})`);
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
            modded: instance.runtime === "modded",
            mods: [],
        };

        const profiles = [...state.profiles, profile];
        state.setProfiles(profiles);
        state.setEditingProfileUuid(profile.uuid);
        state.saveData();

        log(
            "CreateProfile",
            `Created "${profile.name}" (${profile.uuid}) at index ${profiles.length - 1}: ${profile.channel}, ` +
                `version "${profile.versionLabel}" (${profile.versionUuid}), ${profile.modded ? "modded" : "vanilla"}`
        );
        return { profile, index: profiles.length - 1 };
    }
}
