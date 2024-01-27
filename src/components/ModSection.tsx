import DividedSection from "./DividedSection";

type ModSectionProps = {
    actionLock: boolean,
    allMods: string[],
    activeMods: string[],
    setActiveMods: React.Dispatch<React.SetStateAction<string[]>>
}

export default function ModSection({ actionLock, allMods, activeMods, setActiveMods }: ModSectionProps) {
    const toggleMod = (name: string) => {
        let newActiveMods = activeMods;

        if (newActiveMods.includes(name)) {
            newActiveMods = newActiveMods.filter(modName => modName != name);
        } 
        else {
            newActiveMods = [...newActiveMods, name];
        }

        setActiveMods(newActiveMods);
    }

    return (
        <DividedSection className={`flex absolute left-0 right-0 ${actionLock ? "bottom-[96px]" : "bottom-[72px]" } 
            top-[235px] justify-around transition-all duration-300 ease-in-out`
        }>
            <div className="w-[45%] mb-[20px]">
                <p className="minecraft-seven text-white">Active Mods</p>
                <div className="box-border border-[2px] border-[#1E1E1F] bg-[#313233] min-h-[95%]">
                    {allMods.filter(m => activeMods.includes(m)).map(m => (
                        <div 
                            className="flex bg-[#48494A] box-border border-b-[#5A5B5C] border-b-[2px] hover:bg-[#5A5B5C] cursor-pointer"
                            onClick={() => toggleMod(m)}
                            key={m}
                        >
                            <p className="p-[2px] minecraft-seven text-white text-[14px] px-[4px]">{m}</p>
                        </div>
                    ))}
                </div>
            </div>
            <div className="w-[45%] mb-[20px]">
                <p className="minecraft-seven text-white">Inactive Mods</p>
                <div className="box-border border-[2px] border-[#1E1E1F] bg-[#313233] min-h-[95%]">
                    {allMods.filter(m => !activeMods.includes(m)).map(m => (
                        <div 
                            className="flex bg-[#48494A] box-border border-b-[#5A5B5C] border-b-[2px] hover:bg-[#5A5B5C] cursor-pointer"
                            onClick={() => toggleMod(m)}
                            key={m}
                        >
                            <p className="p-[2px] minecraft-seven text-white text-[14px] px-[4px]">{m}</p>
                        </div>
                    ))}
                </div>
            </div>
        </DividedSection>
    );
}