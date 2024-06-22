export type TextInputProps = {
    label: string,
    text: string,
    setText: React.Dispatch<React.SetStateAction<string>>
}

export default function TextInput({label, text, setText}: TextInputProps) {
    return (
        <>
            <p className="minecraft-seven text-white text-[14px]">{label}</p>
            <div className="box-border border-[2px] border-[#1E1E1F] bg-[#313233]">
                <input type="text"
                       className="w-full minecraft-seven outline-none bg-[#313233] text-white text-[14px] px-[4px]"
                       spellCheck={false} value={text} onInput={(event) => {
                    //@ts-ignore
                    setText(event.target.value);
                }}
                />
            </div>
        </>
    )
}