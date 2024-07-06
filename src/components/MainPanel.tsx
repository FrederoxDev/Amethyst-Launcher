import {ReactNode} from "react"

type MainPanelProps = {
    children: ReactNode
}

export default function MainPanel({children}: MainPanelProps) {
    return (
        <div className="h-full w-full flex flex-col">
            <div className="h-full relative flex flex-col">
                {children}
            </div>
        </div>
    )
}