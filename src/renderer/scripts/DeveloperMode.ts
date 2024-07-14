import * as sudo from 'sudo-prompt';

// .node type so window.require is needed
const regedit = window.require('regedit-rs') as typeof import('regedit-rs');

export function IsDevModeEnabled() {
    const regKey = "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock"
    const listed = regedit.listSync(regKey);

    if (!listed[regKey].exists) return false;

    if ("AllowDevelopmentWithoutDevLicense" in listed[regKey].values) {
        const value = listed[regKey].values["AllowDevelopmentWithoutDevLicense"].value;
        return value === 1;
    }

    return false;
}

export async function TryEnableDevMode(): Promise<boolean> {
    const command = `reg add "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock" /v "AllowDevelopmentWithoutDevLicense" /t REG_DWORD /d 1 /f`;
    const options = {
        name: "Amethyst Launcher"
    };

    return new Promise((resolve) => {
        try {
            sudo.exec(command, options, (error, stdout) => {
                if (error) {
                    console.log(`Error: ${error}`);
                    resolve(false);
                } else {
                    console.log(`stdout: ${stdout}`);
                    resolve(true);
                }
            });
        } catch (e) {
            console.log(e)
            resolve(false);
        }
    });
}