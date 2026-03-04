type LoadingWheelProps = {
    text: string;
    percentage: number;
};

export function LoadingWheel({ text, percentage }: LoadingWheelProps) {
    return (
        <>
            <div className="loading-wheel-overlay">
                <div className="loading-wheel-content">
                    <p className="minecraft-seven loading-wheel-text">{text}</p>
                    <p className="minecraft-seven loading-wheel-percentage">{percentage.toPrecision(3)}%</p>
                </div>
            </div>
        </>
    );
}
