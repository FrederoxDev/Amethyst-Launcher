import {useEffect, useState} from "react";

const {ipcRenderer} = window.require('electron');

export default function Header() {
    const [appVersion, setAppVersion] = useState('-');

    useEffect(() => {
        ipcRenderer.invoke('get-app-version').then((version) => {
            setAppVersion(version);
        });
    }, []);

    return (
        <>
            <div className="flex flex-row webkit-drag h-[62px] w-full bg-[#1E1E1F]">
                <div className="flex-shrink-0 h-[64px] w-[66px] p-[8px]  bg-[#1E1E1F] border-[#131415] border-b-[2px]">
                    <div className="block w-[48px] h-[48px]">
                        <img src="logo192.png" className="w-full h-full pixelated"/>
                    </div>
                </div>
                <div className="relative flex flex-col justify-center items-center w-full h-full">
                    <p className="absolute minecraft-ten text-white text-[24px] block translate-y-[-4px]">Amethyst Launcher</p>
                    <p className="absolute minecraft-seven block text-[12px] text-[#BCBEC0] translate-y-[16px]">{appVersion}</p>
                </div>
                <div className="flex-shrink-0 h-[64px] w-[66px]"/>
            </div>
            <div className="h-[2px] w-full bg-[#131415]"/>
        </>
    )
}