import { ipcRenderer } from "electron";
import { InstalledVersionType } from "../InstalledVersionType";
import { VersionsFolder } from "../Paths";
import { Platform } from "../Platform";
import { PlatformArchitecture } from "../PlatformArchitecture";
import { PlatformUtils } from "../PlatformUtils";
import { MinecraftVersion } from "../Versions";
const regedit = window.require('regedit-rs') as typeof import('regedit-rs')
import * as child from 'child_process'
import * as path from 'path'
import { VersionType } from "../VersionType";

const AppDataPath: string = await ipcRenderer.invoke('get-appdata-path')
const LocalAppDataPath: string = await ipcRenderer.invoke('get-localappdata-path');
const AmethystPath: string = path.join(...[AppDataPath, 'Amethyst'])

export class WindowsPlatform extends Platform {
    DoesPlatformNeedInstallation(): boolean {
        return true;
    }

    GetPlatformArchitecture(): PlatformArchitecture {
        const arch = process.arch
        switch (arch) {
            case 'x64':
                return PlatformArchitecture.x64
            case 'ia32':
                return PlatformArchitecture.x86
            case 'arm64':
                return PlatformArchitecture.arm64
            default:
                throw new Error(`Unsupported architecture: ${arch}`)
        }
    }

    GetInstalledVersionType(): InstalledVersionType {
        const checkInstalledVersion = (versionKey: string) => {
            const reg_key = 'HKCU\\SOFTWARE\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages';
            const listed = regedit.listSync(reg_key);
            if (!listed[reg_key].exists) return false;
            const minecraftKey = listed[reg_key].keys.find(key => key.startsWith('MICROSOFT.MINECRAFTUWP_'));
            if (minecraftKey === undefined) return false;
            const minecraftValues = regedit.listSync(`${reg_key}\\${minecraftKey}`)[`${reg_key}\\${minecraftKey}`];
            if (!minecraftValues.exists) return false;
            return true;
        }

        if (checkInstalledVersion('MICROSOFT.MINECRAFTUWP_')) {
            return InstalledVersionType.GDK;
        }
        else if (checkInstalledVersion('Microsoft.MinecraftUWP_')) {
            return InstalledVersionType.UWP;
        }
        else {
            return InstalledVersionType.None;
        }
    }

    GetOpaqueCurrentPackage(): any {
        const reg_key = 'HKCU\\SOFTWARE\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages';
        const listed = regedit.listSync(reg_key);
        if (!listed[reg_key].exists) return undefined;
        const minecraftKey = listed[reg_key].keys.find(key => key.startsWith('Microsoft.MinecraftUWP_'));
        if (minecraftKey === undefined) return undefined;
        const minecraftValues = regedit.listSync(`${reg_key}\\${minecraftKey}`)[`${reg_key}\\${minecraftKey}`];
        if (!minecraftValues.exists) return undefined;
        return minecraftValues;
    }

    GetCurrentPackagePath(): string | undefined {
        const packageInfo = this.GetOpaqueCurrentPackage();
        if (packageInfo === undefined) return undefined;
        return packageInfo.values['PackageRootFolder'].value as string;
    }

    GetCurrentPackageID(): string | undefined {
        const packageInfo = this.GetOpaqueCurrentPackage();
        if (packageInfo === undefined) return undefined;
        return packageInfo.values['PackageID'].value as string;
    }

    async UnregisterCurrentVersion(): Promise<void> {
        if (this.GetInstalledVersionType() === InstalledVersionType.None) 
            return;

        let command: string;
        if (this.GetInstalledVersionType() === InstalledVersionType.UWP) {
            const packageId = this.GetCurrentPackageID();
            command = `powershell -ExecutionPolicy Bypass -Command "& { Remove-AppxPackage -Package "${packageId}" -PreserveRoamableApplicationData }"`;
        }
        else if (this.GetInstalledVersionType() === InstalledVersionType.GDK) {
            command = `powershell -ExecutionPolicy Bypass -Command "& { Get-AppxPackage Microsoft.MinecraftUWP | Remove-AppxPackage -PreserveRoamableApplicationData }"`;
        }
        else {
            throw new Error('Unknown installed version type');
        }
        await PlatformUtils.RunCommand(command);
    }

    async RegisterVersion(version: MinecraftVersion): Promise<void> {
        if (this.GetCurrentPackageID() !== undefined) {
          await this.UnregisterCurrentVersion();
          if (this.GetCurrentPackageID() !== undefined) {
            throw new Error('There is still a version installed!')
          }
        }
    
        const appxManifest = path.join(
          VersionsFolder,
          `Minecraft-${version.version.toString()}`,
          'AppxManifest.xml'
        )
        const registerCmd = `powershell -ExecutionPolicy Bypass -Command "& { Add-AppxPackage -Path '${appxManifest}' -Register }"`
    
        await new Promise<void>((resolve, reject) => {
            child.exec(registerCmd, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`Registration failed: ${stderr || error.message}`));
                    return;
                }
                if (stderr) {
                    reject(new Error(`Registration error: ${stderr}`));
                    return;
                }
                console.log(stdout);
                resolve();
            });
        });
    }

    GetAmethystPath(): string {
        return AmethystPath;
    }

    GetCurrentVersionDataPath(): string | undefined {
        if (this.GetInstalledVersionType() === InstalledVersionType.None)
            return undefined;
        switch (this.GetInstalledVersionType()) {
            case InstalledVersionType.UWP:
                return path.join(LocalAppDataPath, 'Packages', 'Microsoft.MinecraftUWP_8wekyb3d8bbwe');
            case InstalledVersionType.GDK:
                return path.join(AppDataPath, 'Minecraft Bedrock');
            default:
                throw new Error('Unknown installed version type');
        }
    }

    GetMinecraftDataPath(versionType: VersionType): string {
        switch (versionType) {
            case VersionType.UWP:
                return path.join(LocalAppDataPath, 'Packages', 'Microsoft.MinecraftUWP_8wekyb3d8bbwe');
            case VersionType.GDK:
                return path.join(AppDataPath, 'Minecraft Bedrock');
            default:
                throw new Error('Unknown version type');
        }
    }
}