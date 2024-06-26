type MinecraftToggleProps = {
    isChecked: boolean,
    setIsChecked: React.Dispatch<React.SetStateAction<boolean>>,
    className?: string
}

export default function MinecraftToggle({isChecked, setIsChecked, className}: MinecraftToggleProps) {
    const handleCheckboxChange = () => {
        setIsChecked(!isChecked);
    }

    return (
            <div id="switch_panel" className={className} onClick={handleCheckboxChange}>
                <div id="switch_base">
                    <div id="switch_base_on" className={className}>
                        <img src="images/button/on-state.png" id="switch_base_on_image" className={className} alt=""/>
                    </div>

                    <div id="switch_base_off" className={className}>
                        <img src="images/button/off-state.png" id="switch_base_off_image" className={className} alt=""/>
                    </div>
                </div>

                <div id="switch_toggle" className={className + (isChecked ? ' toggle-anim-on' : ' toggle-anim-off')}>
                    
                    <div id="switch_toggle_top" className={className}></div>
                    <div id="switch_toggle_side" className={className}></div>
                </div>
            </div>
    )
}