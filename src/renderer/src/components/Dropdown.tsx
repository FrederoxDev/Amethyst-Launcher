import React, { useEffect, useRef, useState } from "react";

export type DropdownOption = { label: string; value: string };

type DropdownProps = {
    id?: string;
    labelText?: string;
    options: (string | DropdownOption)[];
    value: string;
    setValue: React.Dispatch<React.SetStateAction<string>>;
};

function normalizeOption(option: string | DropdownOption): DropdownOption {
    return typeof option === "string" ? { label: option, value: option } : option;
}

export function Dropdown({ id, labelText, options, value, setValue }: DropdownProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    const selected = options.map(normalizeOption).find(o => o.value === value);

    return (
        <div className="dropdown-root" id={id}>
            {labelText && (
                <label className="minecraft-seven dropdown-label">{labelText}</label>
            )}
            {options.length > 0 ? (
                <div className="dropdown-wrapper" ref={ref}>
                    <div className="dropdown-sizer" aria-hidden="true">
                        {options.map((raw, i) => (
                            <span key={i}>{normalizeOption(raw).label}</span>
                        ))}
                    </div>
                    <div
                        className="minecraft-seven dropdown-trigger"
                        onClick={() => setOpen(o => !o)}
                    >
                        <span>{selected?.label ?? value}</span>
                        <svg
                            className={`dropdown-arrow ${open ? "dropdown-arrow--open" : ""}`}
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="none"
                        >
                            <path
                                d="M3 5L6 8L9 5"
                                stroke="#9f9f9f"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>
                    {open && (
                        <div className="dropdown-menu">
                            {options.map((raw, index) => {
                                const option = normalizeOption(raw);
                                return (
                                    <div
                                        key={index}
                                        className={`minecraft-seven dropdown-option ${option.value === value ? "dropdown-option--active" : ""}`}
                                        onClick={() => {
                                            setValue(option.value);
                                            setOpen(false);
                                        }}
                                    >
                                        {option.label}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : (
                <div className="dropdown-empty" />
            )}
        </div>
    );
}
