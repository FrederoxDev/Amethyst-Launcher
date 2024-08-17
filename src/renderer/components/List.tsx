import React from 'react'

type ListProps = {
  children: React.ReactNode[]
}

export default function List({ children }: ListProps) {
  return <div className="list scrollbar">{children}</div>
}
