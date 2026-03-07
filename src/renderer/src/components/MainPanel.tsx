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
            <div className={`main-panel-section ${className}`}>
                {children}
            </div>
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

interface PanelButtonProps extends MainPanelProps {
    onClick: () => void;
    className?: string;
}

export function PanelButton({ children, onClick, className }: PanelButtonProps) {
    return (
        <div className="panel-card" onClick={onClick}>
            <div className={`panel-card-inner ${className}`}>
                {children}
            </div>
        </div>
    );
}

interface PanelSectionProps extends MainPanelProps {
    className?: string;
}

export function PanelSection({ children, className }: PanelSectionProps) {
    return (
        <div className="panel-card">
            <div className={`panel-card-inner ${className}`}>
                {children}
            </div>
        </div>
    );
}
