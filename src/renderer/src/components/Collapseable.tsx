import React, { useState } from "react";
import "@renderer/styles/components/Collapseable.css";

type CollapseableProps = {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
};

export function Collapseable({ title, children, defaultOpen = false }: CollapseableProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="collapseable">
            <div className="collapseable-header" onClick={() => setIsOpen(v => !v)}>
                <svg
                    className={`collapseable-chevron ${isOpen ? "collapseable-chevron--open" : ""}`}
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                >
                    <path d="M4 2L8 6L4 10" stroke="#BCBEC0" strokeWidth="1.5" strokeLinecap="square" />
                </svg>
                <span className="minecraft-seven collapseable-title">{title}</span>
            </div>
            {isOpen && (
                <div className="collapseable-body">
                    {children}
                </div>
            )}
        </div>
    );
}
