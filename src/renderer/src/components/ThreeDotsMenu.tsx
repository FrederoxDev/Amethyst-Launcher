import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ThreeDotsMenuItem {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
}

interface ThreeDotsMenuProps {
    items: ThreeDotsMenuItem[];
}

export function ThreeDotsMenu({ items }: ThreeDotsMenuProps) {
    const [open, setOpen] = useState(false);
    const dotsRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (
                dotsRef.current && !dotsRef.current.contains(e.target as Node) &&
                dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    useEffect(() => {
        if (!open || !dotsRef.current) return;
        const rect = dotsRef.current.getBoundingClientRect();
        setDropdownPos({
            top: rect.bottom + 10,
            right: window.innerWidth - rect.right,
        });
    }, [open]);

    return (
        <div className="launcher-profile-card-menu" onClick={e => e.stopPropagation()}>
            <div className="launcher-profile-card-dots" ref={dotsRef} onClick={() => setOpen(!open)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="3" r="1.5" fill="#FFFFFF" />
                    <circle cx="8" cy="8" r="1.5" fill="#FFFFFF" />
                    <circle cx="8" cy="13" r="1.5" fill="#FFFFFF" />
                </svg>
            </div>
            {open && createPortal(
                <div
                    className="launcher-profile-card-dropdown"
                    ref={dropdownRef}
                    style={{ top: dropdownPos.top, right: dropdownPos.right }}
                    onClick={e => e.stopPropagation()}
                >
                    {items.map((item, i) => (
                        <div
                            key={i}
                            className={`launcher-profile-card-dropdown-item${item.danger ? " launcher-profile-card-dropdown-item--danger" : ""}`}
                            onClick={() => { item.onClick(); setOpen(false); }}
                        >
                            {item.icon}
                            <p className="minecraft-seven">{item.label}</p>
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
}
