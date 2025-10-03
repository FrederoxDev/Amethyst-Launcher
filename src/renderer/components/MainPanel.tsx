import { ReactNode } from 'react'

type MainPanelProps = {
  children: ReactNode
}

export function MainPanel({ children }: MainPanelProps) {
  return <div className="h-full w-full relative flex flex-col">{children}</div>
}

interface MainPanelSectionProps extends MainPanelProps {
  className?: string
}

export function MainPanelSection({ children, className }: MainPanelSectionProps) {
  return <MainPanel>
    <div className={`w-full h-full flex flex-col p-[8px] gap-[8px] border-[3px] border-[#1E1E1F] bg-[#48494A] ${className}`}>
      {children}
    </div>
  </MainPanel>
}

interface PanelIndentProps extends MainPanelProps {
  className?: string
}

export function PanelIndent({ children, className }: PanelIndentProps) {
  return <div className={`flex flex-col gap-[3px] border-[3px] border-[#1E1E1F] h-full bg-[#313233] overflow-y-auto overflow-x-hidden scrollbar ${className}`}>
    {children}
  </div>
}

interface PanelButtonProps extends MainPanelProps {
  onClick: () => void
  className?: string
}

export function PanelButton({ children, onClick, className }: PanelButtonProps) {
  return <div className={`m-[-3px] border-[3px] border-[#1E1E1F]`} onClick={onClick}>
    <div className={`cursor-pointer border-[3px] border-t-[#5a5b5c] border-l-[#5a5b5c] border-b-[#333334] border-r-[#333334] bg-[#48494a] p-[4px] ${className}`}>{children}</div>
  </div>
}

interface PanelSectionProps extends MainPanelProps {
  className?: string
}

export function PanelSection({ children, className }: PanelSectionProps) {
  return <div className={`m-[-3px] border-[3px] border-[#1E1E1F]`}>
    <div className={`cursor-pointer border-[3px] border-t-[#5a5b5c] border-l-[#5a5b5c] border-b-[#333334] border-r-[#333334] bg-[#48494a] p-[4px] ${className}`}>{children}</div>
  </div>
}