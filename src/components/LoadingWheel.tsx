type LoadingWheelProps = {
    text: string,
    percentage: number
}

export default function LoadingWheel({text, percentage}: LoadingWheelProps) {
    return (
        <>
            <div className="fixed top-0 left-0 flex flex-col w-full items-center justify-center h-full">
                <div className="flex flex-col items-center">
                    <p className="minecraft-seven text-white text-[14px]">{text}</p>
                    <p className="minecraft-seven text-white text-[64px]">{percentage.toPrecision(3)}%</p>
                </div>
            </div>
        </>
    )
}