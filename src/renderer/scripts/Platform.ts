import { InstalledVersionType } from "./InstalledVersionType";
import { PlatformArchitecture } from "./PlatformArchitecture";
import { MinecraftVersion } from "./Versions";
import { VersionType } from "./VersionType";

export class Platform {
    DoesPlatformNeedInstallation(): boolean {
        throw new Error('Not implemented');
    }

    GetPlatformArchitecture(): PlatformArchitecture {
        throw new Error('Not implemented');
    }

    GetInstalledVersionType(): InstalledVersionType {
        throw new Error('Not implemented');
    }

    GetOpaqueCurrentPackage(): any {
        throw new Error('Not implemented');
    }

    GetCurrentPackagePath(): string | undefined {
        throw new Error('Not implemented');
    }

    GetCurrentPackageID(): string | undefined {
        throw new Error('Not implemented');
    }

    async UnregisterCurrentVersion(): Promise<void> {
        return Promise.reject(new Error('Not implemented'));
    }

    async RegisterVersion(version: MinecraftVersion): Promise<void> {
        return Promise.reject(new Error('Not implemented'));
    }

    GetAmethystPath(): string {
        throw new Error('Not implemented');
    }

    GetCurrentVersionDataPath(): string | undefined {
        throw new Error('Not implemented');
    }

    GetMinecraftDataPath(versionType: VersionType): string {
        throw new Error('Not implemented');
    }
}