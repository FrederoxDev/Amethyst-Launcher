import React from 'react'

type PopupPanelProps = {
  children: React.ReactNode
  onExit?: () => void
}

export default function PopupPanel({ children, onExit }: PopupPanelProps) {
  return (
    <div className="fixed flex justify-center items-center top-0 left-0 w-full h-full bg-[#000000BB]" onClick={onExit}>
      <div className="flex flex-col items-center justify-center border-[3px] border-[#1E1E1F]">{children}</div>
    </div>
  )
}
