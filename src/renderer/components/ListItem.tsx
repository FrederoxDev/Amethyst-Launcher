import React, { ReactNode } from 'react'

type ListItemProps = {
  children: ReactNode
  onClick?: () => void
  className?: string
}

export default function ListItem({ children, onClick, className }: ListItemProps) {
  return (
    <div className={`list_item ${className}`} onClick={onClick}>
      <div className="list_item_border">
        {children}
      </div>
    </div>
  )
}