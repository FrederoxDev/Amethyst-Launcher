type DropdownProps = {
  id: string
  labelText: string
  options: string[]
  value: string
  setValue: React.Dispatch<React.SetStateAction<string>>
}

export default function Dropdown({ id, labelText, options, value, setValue }: DropdownProps) {
  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = event.target.value
    setValue(selectedValue)
  }

  return (
    <div className="">
      <label htmlFor={id} className="minecraft-seven text-white text-[14px]">
        {labelText}
      </label>
      {options.length > 0 ? (
        <select
          name={id}
          id={id}
          onChange={handleSelectChange}
          value={value}
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
