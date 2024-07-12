import { GetInstalledVersionsFromFile, InstalledVersion, ValidateVersionsFile } from "../scripts/Versions";
import { useState } from "react";
import { ipcRenderer } from "electron";

const fs = window.require('fs') as typeof import('fs')
const child = window.require('child_process') as typeof import('child_process')

type VersionButtonProps = {
    version: InstalledVersion;
    onInspect: (() => void);
    onDelete: (() => void);
}

const VersionButton = ({version, onInspect, onDelete}: VersionButtonProps) => {
    function DeleteVersion() {
        const message_args = { message: "Are you sure you want to delete this version?\n\nThis is an irreversible action!", type: "warning", buttons: ["Cancel", "Confirm"], defaultId: 0, title: "Delete Version", noLink: true}
        ipcRenderer.invoke('show-message', message_args).then((value: Electron.MessageBoxReturnValue) => {
            if (value.response === 0) return;

            else if (value.response === 1) {
                // REMOVE VERSION
                if (fs.existsSync(version.path)) {
                    fs.rm(version.path, { recursive: true }, (err) => {
                        if (err) {
                            console.error(err);
                        }
                        else {
                            onDelete()
                            console.warn(`Deleted Version: ${version.version.toString()} at ${version.path}`);
                        }
                    })
                }
            }
        })
    }

    function OpenVersionLocation() {
        if (fs.existsSync(version.path)) {
            child.spawn(`explorer "${version.path}"`, {shell: true})
        }
    }

    function InspectVersion() {
        onInspect();
    }

    return (
        <div className="flex flex-row w-full justify-between border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] px-[2px]">
            <div className="h-full flex flex-col justify-center items-center min-w-0 p-[8px]">
                <p className="minecraft-seven text-white text-[16px]">{version.version.toString()}</p>
                {/*<p className="minecraft-seven text-[#B1B2B5] text-[14px] overflow-ellipsis overflow-hidden whitespace-nowrap">{"Path:"} ({version.path})</p>*/}
            </div>
            <div className="shrink-0 flex flex-row p-[8px] gap-[8px] justify-right items-center">

                <div className="cursor-pointer w-[32px] h-[32px] bg-[#333334] hover:bg-[#FF000080] rounded-[4px] p-[4px]" onClick={() => DeleteVersion()}>
                    <img src="images/icons/delete-icon.png" className="w-[24px] h-[24px]" alt=""/>
                </div>

                <div className="cursor-pointer w-[32px] h-[32px] bg-[#333334] hover:bg-[#5a5b5c] rounded-[4px] p-[4px]" onClick={() => OpenVersionLocation()}>
                    <img src="images/icons/open-folder-icon.png" className="w-[24px] h-[24px]" alt=""/>
                </div>

                <div className="cursor-pointer w-[32px] h-[32px] bg-[#333334] hover:bg-[#5a5b5c] rounded-[4px] p-[4px]" onClick={() => InspectVersion()}>
                    <img src="images/icons/info-icon.png" className="w-[24px] h-[24px]" alt=""/>
                </div>
            </div>
        </div>
    )
}

export default function VersionPage() {
    ValidateVersionsFile()
    const [versions, SetVersions] = useState<InstalledVersion[]>(GetInstalledVersionsFromFile())


    function RefreshVersions() {
        ValidateVersionsFile()
        SetVersions(GetInstalledVersionsFromFile())
    }

    const [selected_version, SetSelectedVersion] = useState<InstalledVersion | undefined>(undefined)

    return (
        <>
            <div className="relative w-full h-full">
                <div
                    className="flex flex-col gap-[8px] h-full p-[8px] bg-[#48494A] border-[#1E1E1F] border-[3px] overflow-hidden">
                    <p className="minecraft-seven text-white text-[14px]">Version Manager</p>
                    <div
                        className="flex flex-col border-[3px] border-[#1E1E1F] h-full bg-[#313233] overflow-y-auto overflow-x-hidden scrollbar">

                        {
                            versions.map((version, index) => {
                                return <VersionButton version={version} onInspect={() => SetSelectedVersion(version)} onDelete={() => RefreshVersions()} key={index}/>
                            })
                        }
                    </div>
                </div>
            </div>

            {
                selected_version &&

                (
                    <>
                        <div className="fixed top-0 left-0 w-full h-full bg-[#000000BB]" onClick={() => SetSelectedVersion(undefined)}></div>

                        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center border-[3px] border-[#1E1E1F]">
                            <div className="w-[500px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                                <div className="flex">
                                    <p className="minecraft-seven text-white text-[14px] max-w-[400px]">{selected_version.version.toString()}</p>
                                    <div className="p-[4px] justify-center items-center ml-auto cursor-pointer" onClick={() => SetSelectedVersion(undefined)}>
                                        <svg width="12" height="12" viewBox="0 0 12 12">
                                            <polygon className="fill-[#FFFFFF]" fillRule="evenodd"
                                                     points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"/>
                                        </svg>
                                    </div>
                                </div>

                                <p className="minecraft-seven text-[#BCBEC0] text-[12px] max-w-[400px]">{selected_version.path}</p>
                            </div>
                        </div>
                    </>
                )
            }
        </>

    )
}