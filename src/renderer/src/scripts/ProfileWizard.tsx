import { Popup } from "@renderer/states/PopupStore";
import { NewInstancePopup, NewInstanceResult } from "@renderer/popups/NewInstancePopup";
import { VersionPickerPopup, VersionPickerResult } from "@renderer/popups/VersionPickerPopup";
import { useAppStore } from "@renderer/states/AppStore";
import { Profile } from "./Profiles";

/**
 * Runs the VersionPicker -> NewInstance popup wizard, creates the profile,
 * persists it to the store, and returns it. Returns null if the user cancels.
 *
 * Pass an initialVersionResult to pre-populate the version picker step (used
 * when the caller already picked a version and wants to continue with a new profile).
 */
export async function runCreateProfileWizard(
    initialVersionResult?: VersionPickerResult | null
): Promise<Profile | null> {
    let versionResult =
        initialVersionResult ??
        (await Popup.useAsync<VersionPickerResult | null>(props => <VersionPickerPopup {...props} />));
    if (!versionResult) return null;

    while (true) {
        const instanceResult = await Popup.useAsync<NewInstanceResult | null>(props => (
            <NewInstancePopup {...props} versionLabel={versionResult!.display_name} />
        ));

        if (!instanceResult) return null;

        if (instanceResult.kind === "reselect") {
            const newVersion = await Popup.useAsync<VersionPickerResult | null>(props => (
                <VersionPickerPopup {...props} />
            ));
            if (!newVersion) return null;
            versionResult = newVersion;
            continue;
        }

        const isModded = instanceResult.runtime === "modded";
        const newProfile: Profile = {
            uuid: crypto.randomUUID(),
            name: instanceResult.name,
            is_modded: isModded,
            minecraft_version: versionResult.minecraft_version,
            version_uuid: versionResult.version_uuid,
            runtime: "Vanilla",
        };

        const state = useAppStore.getState();
        const newProfiles = [...state.allProfiles, newProfile];
        state.setAllProfiles(newProfiles);
        state.setSelectedProfile(newProfiles.length - 1);
        state.saveData();

        return newProfile;
    }
}
