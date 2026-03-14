import React from "react";

export type DropdownOption = { label: string; value: string };

type DropdownProps = {
    id: string;
    labelText: string;
    options: (string | DropdownOption)[];
    value: string;
    setValue: React.Dispatch<React.SetStateAction<string>>;
};

function normalizeOption(option: string | DropdownOption): DropdownOption {
    return typeof option === "string" ? { label: option, value: option } : option;
}

export function Dropdown({ id, labelText, options, value, setValue }: DropdownProps) {
    const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedValue = event.target.value;
        setValue(selectedValue);
    };

    return (
        <div className="dropdown-root">
            <label htmlFor={id} className="minecraft-seven dropdown-label">
                {labelText}
            </label>
            {options.length > 0 ? (
                <select
                    name={id}
                    id={id}
                    onChange={handleSelectChange}
                    value={value}
                    className="minecraft-seven dropdown-select"
                >
                    {options.map((raw, index) => {
                        const option = normalizeOption(raw);
                        return (
                            <option value={option.value} key={index} className="dropdown-option">
                                {option.label}
                            </option>
                        );
                    })}
                </select>
            ) : (
                <div className="dropdown-empty" />
            )}
        </div>
    );
}
