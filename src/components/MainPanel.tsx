import { ReactNode } from "react"

type MainPanelProps = {
    children: ReactNode
}

export default function MainPanel({children}: MainPanelProps) {
    return (
        <div className="fixed top-[48px] left-[64px] right-0 bottom-0 flex flex-col">
            <div className="h-full relative flex flex-col">
                <div className="h-[2px] bg-[#333334]"></div>
                { children }
            </div>
        </div>
    )
}