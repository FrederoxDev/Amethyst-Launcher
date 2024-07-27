import React from 'react'

type DropdownProps = {
  id: string
  labelText: string
  options: string[]
  default_index: number
  SetIndex: (index: number) => void
}

export default function Dropdown({ id, labelText, options, default_index, SetIndex }: DropdownProps) {
  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selected_index = event.target.selectedIndex
    SetIndex(selected_index)
  }

  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="minecraft-seven text-white text-[14px]">
        {labelText}
      </label>
      {options.length > 0 ? (
        <select
          name={id}
          id={id}
          onChange={handleSelectChange}
          value={options[default_index]}
          className="border-[3px] border-[#1E1E1F] bg-[#313233] w-full h-[25px] text-white minecraft-seven text-[12px]"
        >
          {options.map((option, index) => (
            <option value={option} key={index} className="text-white font-sans">
              {option}
            </option>
          ))}
        </select>
      ) : (
        <div className="border-[3px] border-[#1E1E1F] bg-[#313233] w-full h-[25px]" />
      )}
    </div>
  )
}
