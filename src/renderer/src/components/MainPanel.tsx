import { ReactNode } from "react";

type MainPanelProps = {
    children: ReactNode;
};

export function MainPanel({ children }: MainPanelProps) {
    return <div className="main-panel">{children}</div>;
}

interface MainPanelSectionProps extends MainPanelProps {
    className?: string;
}

export function MainPanelSection({ children, className }: MainPanelSectionProps) {
    return (
        <MainPanel>
            <div className={`main-panel-section ${className}`}>{children}</div>
        </MainPanel>
    );
}

interface PanelIndentProps extends MainPanelProps {
    className?: string;
    style?: React.CSSProperties;
}

export function PanelIndent({ children, className, style }: PanelIndentProps) {
    return (
        <div className={`panel-indent scrollbar ${className}`} style={style}>
            {children}
        </div>
    );
}
