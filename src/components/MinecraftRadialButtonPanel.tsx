import { useState } from "react";
import MinecraftRadialButton from "./MinecraftRadialButton";
import { useAppState } from "../contexts/AppState";

export default function MinecraftRadialButtonPanel() {
    const {UITheme, setUITheme} = useAppState();

    const [selectedValue, setSelectedValue] = useState(UITheme);


    function handleSelectionChange(text: string) {
        setSelectedValue(text)

        setUITheme(text)
    }

    return (
        <div className="w-full h-full flex items-center justify-center">
            <MinecraftRadialButton text="Light" onChange={(text) => {handleSelectionChange(text)}} selected={selectedValue == 'Light'}></MinecraftRadialButton>
            <MinecraftRadialButton className="mx-[8px]" text="Dark" onChange={(text) => {handleSelectionChange(text)}} selected={selectedValue == 'Dark'}></MinecraftRadialButton>
            <MinecraftRadialButton text="System" onChange={(text) => {handleSelectionChange(text)}} selected={selectedValue == 'System'}></MinecraftRadialButton>
        </div>
    )
}