import { ReactNode } from 'react'

type MainPanelProps = {
  children: ReactNode
}

export default function Panel({ children }: MainPanelProps) {
  return <div className="panel">{children}</div>
}
