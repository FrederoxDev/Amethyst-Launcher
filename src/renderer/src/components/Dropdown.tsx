import React from "react";

type DropdownProps = {
    id: string;
    labelText: string;
    options: string[];
    value: string;
    setValue: React.Dispatch<React.SetStateAction<string>>;
};

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
                    {options.map((option, index) => (
                        <option value={option} key={index} className="dropdown-option">
                            {option}
                        </option>
                    ))}
                </select>
            ) : (
                <div className="dropdown-empty" />
            )}
        </div>
    );
}
