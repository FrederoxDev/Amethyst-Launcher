type MinecraftToggleProps = {
    isChecked: boolean,
    setIsChecked: React.Dispatch<React.SetStateAction<boolean>>
}

export default function MinecraftToggle({isChecked, setIsChecked}: MinecraftToggleProps) {

    const handleCheckboxChange = () => {
        setIsChecked(!isChecked);
    }

    return (
            <div id="switch_panel" onClick={handleCheckboxChange}>
                <div id="switch_base">
                    <div id="switch_base_on">
                        <img src="images/button/on-state.png" id="switch_base_on_image" alt=""/>
                    </div>

                    <div id="switch_base_off">
                        <img src="images/button/off-state.png" id="switch_base_off_image" alt=""/>
                    </div>
                </div>

                <div id="switch_toggle" className={(isChecked ? ' toggle-anim-on' : ' toggle-anim-off')}>
                    <div id="switch_toggle_top"></div>
                    <div id="switch_toggle_side"></div>
                </div>
            </div>
    )
}