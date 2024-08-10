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
    <div
      ref={ref}
      className="flex flex-row shrink-0 relative border-[3px] border-[#1E1E1F]"
      onClick={() => SetOpen(!open)}
    >
      <div className="flex flex-row w-fit shrink-0 gap-[8px] items-center inset_button ">{options[selected_index]}</div>

      {open && (
        <div
          className="flex flex-col w-fit absolute border-[3px] border-[#1E1E1F] top-auto bottom-full overflow-y-auto scrollbar max-h-[200px] bg-[#48494A]">
          {options.map((option, index) => {
            if (index !== selected_index) {
              return (
                <div
                  className="flex flex-row w-full shrink-0 gap-[8px] items-center inset_button"
                  onClick={() => SetIndex(index)}
                >
                  {option}
                </div>
              )
            }
          })}
        </div>
      )}
    </div>
  )
}
