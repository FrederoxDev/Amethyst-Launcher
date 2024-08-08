import React, { useState } from 'react'

type DropdownProps = {
  options: React.ReactNode[]
  default_index: number
  SetIndex: (index: number) => void
}

export default function MinecraftDropdown({ options, default_index, SetIndex }: DropdownProps) {

  const [show_options, SetShowOptions] = useState<boolean>(false)

  return (
    <div className="relative" onClick={() => SetShowOptions(!show_options)}>
      {
        options[default_index]
      }

      {
        show_options && (
          <div className="absolute">
            {
              options.map((option, index) => {
                if (index !== default_index) {
                  return (
                    <div onClick={() => SetIndex(index)}>
                      {option}
                    </div>
                  )
                }
              })
            }
          </div>
        )
      }
    </div>
  )
}
