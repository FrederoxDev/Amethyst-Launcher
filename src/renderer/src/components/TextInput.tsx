export type TextInputProps = {
    label: string;
    text: string;
    setText: React.Dispatch<React.SetStateAction<string>>;
};

export function TextInput({ label, text, setText }: TextInputProps) {
    return (
        <div>
            <p className="minecraft-seven text-input-label">{label}</p>
            <div className="text-input-box">
                <input
                    type="text"
                    className="minecraft-seven text-input-control"
                    spellCheck={false}
                    value={text}
                    onInput={event => {
                        setText(event.currentTarget.value);
                    }}
                />
            </div>
        </div>
    );
}
