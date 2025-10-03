import React from 'react'

type MinecraftToggleProps = {
  isChecked: boolean
  setIsChecked: React.Dispatch<React.SetStateAction<boolean>>
}

export function MinecraftToggle({ isChecked, setIsChecked }: MinecraftToggleProps) {
  const handleCheckboxChange = () => {
    setIsChecked(!isChecked)
  }

  return (
    <div className="toggle_panel" onClick={handleCheckboxChange}>
      <div className="toggle_base">
        <div className="toggle_base_on">
          <img className="toggle_base_on_image" src="/images/button/on-state.png" alt="" />
        </div>

        <div className="toggle_base_off">
          <img className="toggle_base_off_image" src="/images/button/off-state.png" alt="" />
        </div>
      </div>

      <div className={'toggle' + (isChecked ? ' toggle-anim-on' : ' toggle-anim-off')}>
        <div className="toggle_top"></div>
        <div className="toggle_side"></div>
      </div>
    </div>
  )
}
