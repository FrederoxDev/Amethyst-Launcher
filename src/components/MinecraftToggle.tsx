type MinecraftToggleProps = {
    isChecked: boolean,
    setIsChecked: React.Dispatch<React.SetStateAction<boolean>>,
    id: string
}

export default function MinecraftToggle({isChecked, setIsChecked, id}: MinecraftToggleProps) {
    const handleCheckboxChange = () => {
        setIsChecked(!isChecked);
    }

    return (
        <label htmlFor={id} className="select-none cursor-pointer" onClick={handleCheckboxChange}>
            <div className="relative w-[75px] h-[35px]">
                {/* Grey/Green sides */}
                <div className="absolute w-full h-full border-[3px] border-[#1E1E1F] flex">
                    <div className="w-[32px] h-[29px] border-[3px] border-[#639D52] border-r-0 bg-[#3C8527] flex items-center justify-center">
                        <img src="images/button/on-state.png" className="w-[var(--base2scale)] h-[14px]" alt=""/>
                    </div>

                    <div className="w-[6px] bg-[#1e1e1f]"/>

                    <div className="w-[32px] h-[29px] border-[3px] border-[#A3A4A6] border-l-0 bg-[#8C8D90] flex items-center justify-center">
                        <img src="images/button/off-state.png" className="w-[14px] h-[14px]" alt=""/>
                    </div>
                </div>

                {/* Toggle */}
                
                <div className={`absolute w-[40px] h-[40px] bg-[#D0D1D4] border-[3px] border-[#1E1E1F] translate-y-[-5px] z-10 ${isChecked ? 'toggle-anim-on' : 'toggle-anim-off'}`}>
                    
                    <div className="w-[34px] h-[29px] border-[3px] border-[#ECEDEE] hover:bg-[#B1B2B5]"></div>
                    <div className="h-[5px] bg-[#58585A]"></div>
                </div>
            </div>
        </label>
    )
}