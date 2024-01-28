import { ReactNode } from "react"

type DividedSectionProps = {
    children: ReactNode;
    className?: string;
    style?: React.CSSProperties;
};

export default function DividedSection({ children, className, style }: DividedSectionProps) {
    return (
        <div className={`border-y-[2px] border-solid border-t-[#5A5B5C] border-b-[#000] p-[8px] bg-[#48494A] ${className}`} style={style}>
            {children}
        </div>
    );
}