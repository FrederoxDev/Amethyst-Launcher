export type ReadOnlyTextBoxProps = {
  label: string
  text: string
}

export default function ReadOnlyTextBox({ label, text }: ReadOnlyTextBoxProps) {
  return (
    <div className="flex flex-col gap-[8px]">
      <p className="minecraft-seven text-white text-[14px]">{label}</p>
      <div className="p-[4px] border-[3px] border-[#1E1E1F] bg-[#313233]">
        <p className="w-full minecraft-seven leading-tight text-white text-[14px] whitespace-pre-wrap select-text">
          {text || <span>&nbsp;</span>}
        </p>
      </div>
    </div>
  )
}
