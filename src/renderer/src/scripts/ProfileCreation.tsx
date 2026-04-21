import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { MinecraftVersionType } from "@renderer/scripts/VersionDatabase";
import { useAppStore } from "@renderer/states/AppStore";
import { Popup } from "@renderer/states/PopupStore";
import { Profile } from "@renderer/scripts/Profiles";
import { VersionPickerPopup, VersionPickerResult } from "@renderer/popups/VersionPickerPopup";
import { NewInstancePopup, NewInstanceResult } from "@renderer/popups/NewInstancePopup";

export interface CreateProfileResult {
    profile: Profile;
    index: number;
}

/**
 * Runs the full "pick version -> new instance -> create profile" popup flow.
 * If the user picked an imported .msixvc, the import is triggered after "Create" is clicked.
 * Returns the created profile and its index, or null if the user cancelled.
 */
export async function createProfileFlow(): Promise<CreateProfileResult | null> {
    let versionResult = await Popup.useAsync<VersionPickerResult | null>(props => {
        return <VersionPickerPopup {...props} />;
    });
    if (!versionResult) return null;

    while (true) {
        const instanceResult = await Popup.useAsync<NewInstanceResult | null>(props => {
            return <NewInstancePopup {...props} versionLabel={versionResult!.display_name} />;
        });
        if (!instanceResult) return null;

        if (instanceResult.kind === "reselect") {
            const newVersion = await Popup.useAsync<VersionPickerResult | null>(props => {
                return <VersionPickerPopup {...props} />;
            });
            if (!newVersion) return null;
            versionResult = newVersion;
            continue;
        }

        // If this was an import, start the actual install now
        if (versionResult.importData) {
            const data = versionResult.importData;
            const versionManager = useAppStore.getState().versionManager;
            versionManager.installVersion({
                kind: "imported",
                name: data.name,
                version: SemVersion.fromString(data.version),
                type: data.type.toLowerCase() as MinecraftVersionType,
                uuid: data.uuid,
                file: data.file,
            }).then(() => {
                console.log("Imported version installed successfully!");
            }).catch(e => {
                console.error("Failed to install imported version:", e);
            });
        }

        const isModded = instanceResult.runtime === "modded";
        const state = useAppStore.getState();
        const newProfile: Profile = {
            uuid: crypto.randomUUID(),
            name: instanceResult.name,
            is_modded: isModded,
            minecraft_version: versionResult.minecraft_version,
            version_uuid: versionResult.version_uuid,
            mods: [],
            runtime: "Vanilla",
        };
        const newProfiles = [...state.allProfiles, newProfile];
        state.setAllProfiles(newProfiles);
        state.setEditingProfile(newProfiles.length - 1);
        state.saveData();

        return { profile: newProfile, index: newProfiles.length - 1 };
    }
}
