export type TextInputProps = {
    label: string;
    text: string;
    setText: React.Dispatch<React.SetStateAction<string>>;
    placeholder?: string;
    style?: React.CSSProperties;
};

export function TextInput({ label, text, setText, placeholder, style }: TextInputProps) {
    return (
        <div style={{
                display: "flex",
                flexDirection: "column",
                ...style
            }}>
            <p className="minecraft-seven text-input-label">{label}</p>
            <div className="text-input-box">
                <input
                    type="text"
                    className="minecraft-seven text-input-control"
                    spellCheck={false}
                    placeholder={placeholder}
                    value={text}
                    onInput={event => {
                        setText(event.currentTarget.value);
                    }}
                />
            </div>
        </div>
    );
}
