import React, { useEffect, useRef, useState } from 'react'

type DropdownProps = {
  options: React.ReactNode[]
  selected_index: number
  SetIndex: (index: number) => void
}

export default function MinecraftDropdown({ options, selected_index, SetIndex }: DropdownProps) {

  const [open, SetOpen] = useState<boolean>(false)

  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        SetOpen(false)
      }
    }

    window.addEventListener('click', handleClickOutside)

    return () => {
      window.removeEventListener('click', handleClickOutside)
    }
  }, [])

  return (
    <div ref={ref} className="flex flex-row w-fit shrink-0 gap-[8px] items-center px-[8px] inset_button relative"
         onClick={() => SetOpen(!open)}>
      {
        options[selected_index]
      }

      {
        open && (
          <div className="flex flex-row w-fit shrink-0 gap-[8px] items-center px-[8px] inset_button absolute">
            {
              options.map((option, index) => {
                if (index !== selected_index) {
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
