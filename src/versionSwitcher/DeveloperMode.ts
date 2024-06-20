const regedit = window.require("regedit-rs") as typeof import("regedit-rs");
const sudo = require('sudo-prompt');

export function isDeveloperModeEnabled() {
    const regKey = "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock"
    const listed = regedit.listSync(regKey);

    if (!listed[regKey].exists) return false;

    if ("AllowDevelopmentWithoutDevLicense" in listed[regKey].values) {
        const value = listed[regKey].values["AllowDevelopmentWithoutDevLicense"].value;
        return value == 1;
    }

    return false;
}

export async function tryEnableDeveloperMode(): Promise<boolean> {
    const command = `reg add "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock" /v "AllowDevelopmentWithoutDevLicense" /t REG_DWORD /d 1 /f`;
    var options = {
        name: "Amethyst Launcher"
    };

    return new Promise((resolve, reject) => {
        try {
            sudo.exec(command, options, (error: any, stdout: any, stderr: any) => {
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