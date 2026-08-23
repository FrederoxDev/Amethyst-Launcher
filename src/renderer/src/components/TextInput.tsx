export type TextInputProps = {
    label: string;
    text: string;
    setText: (text: string) => void;
    placeholder?: string;
    style?: React.CSSProperties;
    autoFocus?: boolean;
};

export function TextInput({ label, text, setText, placeholder, style, autoFocus }: TextInputProps) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                ...style,
            }}
        >
            {label && <p className="minecraft-seven text-input-label">{label}</p>}
            <div className="text-input-box">
                <input
                    type="text"
                    className="minecraft-seven text-input-control"
                    spellCheck={false}
                    placeholder={placeholder}
                    value={text}
                    autoFocus={autoFocus}
                    onInput={event => {
                        setText(event.currentTarget.value);
                    }}
                />
            </div>
        </div>
    );
}
