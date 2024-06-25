import {ReactNode} from "react"

type MainPanelProps = {
    children: ReactNode
}

export default function MainPanel({children}: MainPanelProps) {
    return (
        <div className="fixed top-[62px] left-[66px] right-0 bottom-0 flex flex-col">
            <div className="h-full relative flex flex-col">
                {children}
            </div>
        </div>
    )
}