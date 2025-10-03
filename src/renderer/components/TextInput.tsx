export type TextInputProps = {
  label: string
  text: string
  setText: React.Dispatch<React.SetStateAction<string>>
}

export function TextInput({ label, text, setText }: TextInputProps) {
  return (
    <div>
      <p className="minecraft-seven text-white text-[14px]">{label}</p>
      <div className="border-[3px] h-[25px] border-[#1E1E1F] bg-[#313233]">
        <input
          type="text"
          className="w-full minecraft-seven outline-none bg-transparent translate-y-[1px] pl-[4px] text-white text-[12px]"
          spellCheck={false}
          value={text}
          onInput={event => {
            setText(event.currentTarget.value)
          }}
        />
      </div>
    </div>
  )
}
