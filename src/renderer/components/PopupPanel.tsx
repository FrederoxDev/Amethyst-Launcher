import React from 'react'

type PopupPanelProps = {
  children: React.ReactNode
  onExit?: () => void
}

export function PopupPanel({ children, onExit }: PopupPanelProps) {
  return (
    <div className="fixed flex justify-center items-center top-0 left-0 w-full h-full bg-[#000000BB]" onClick={onExit}>
      {children}
    </div>
  )
}
