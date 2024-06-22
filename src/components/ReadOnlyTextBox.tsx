export type ReadOnlyTextBoxProps = {
    label: string,
    text: string,
}

export default function ReadOnlyTextBox({label, text}: ReadOnlyTextBoxProps) {
    return (
        <>
            <p className="minecraft-seven text-white text-[14px]">{label}</p>
            <div className="box-border border-[2px] border-[#1E1E1F] bg-[#313233]">
                <p className="w-full minecraft-seven outline-none bg-[#313233] text-white text-[14px] px-[4px] whitespace-pre-wrap">
                    {text || <span>&nbsp;</span>}
                </p>
            </div>
        </>
    )
}