export type TextInputProps = {
  label: string
  text: string
  setText: React.Dispatch<React.SetStateAction<string>>
}

export default function TextInput({ label, text, setText }: TextInputProps) {
  return (
    <div className="flex flex-col gap-[4px]">
      <p className="minecraft-seven text-white text-[14px]">{label}</p>
      <div className="flex border-[3px] h-[25px] border-[#1E1E1F] bg-[#313233] justify-center p-[4px]">
        <input
          type="text"
          className="w-full minecraft-seven bg-transparent text-white text-[12px]"
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
