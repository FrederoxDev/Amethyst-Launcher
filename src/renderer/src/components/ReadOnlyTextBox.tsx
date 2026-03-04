export type ReadOnlyTextBoxProps = {
    label: string;
    text: string;
};

export function ReadOnlyTextBox({ label, text }: ReadOnlyTextBoxProps) {
    return (
        <>
            <p className="minecraft-seven readonly-label">{label}</p>
            <div className="readonly-box">
                <p className="minecraft-seven readonly-text">
                    {text || <span>&nbsp;</span>}
                </p>
            </div>
        </>
    );
}
