import { useState } from 'react'
import MinecraftRadialButton from './MinecraftRadialButton'

type RadialButtonPanelProperties = {
  elements: {
    text: string
    value: string
    className?: string
  }[]

  default_selected_value?: string
  dark?: boolean

  onChange: (selected_value: string) => void
}

export default function MinecraftRadialButtonPanel({
  elements,
  default_selected_value,
  dark,
  onChange
}: RadialButtonPanelProperties) {
  const [selected_value, setSelectedValue] = useState(default_selected_value)

  function handleSelect(value: string) {
    setSelectedValue(value)
    onChange(value)
  }

  return (
    <>
      <div className="flex items-center justify-center mx-[1.5px]">
        {elements.map(element => {
          return (
            <MinecraftRadialButton
              key={element.value}
              text={element.text}
              value={element.value}
              selected={selected_value === element.value}
              className={element.className}
              dark={dark}
              onChange={handleSelect}
            />
          )
        })}
      </div>
    </>
  )
}
