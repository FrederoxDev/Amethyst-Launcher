type RadialButtonProperties = {
  text: string
  value: string
  selected: boolean
  className?: string
  onChange: (value: string) => void
}

export function MinecraftRadialButton({ text, value, selected, className, onChange }: RadialButtonProperties) {
  return (
    <div className={`radial_button_base ${className}`} onClick={() => onChange(value)}>
      <div className={`radial_button_border ${selected ? 'selected' : ''}`}>
        <div className={`radial_button_top ${selected ? 'selected' : ''}`}>
          <p className={`radial_button_text ${selected ? 'selected' : ''}`}>{text}</p>
        </div>
        <div className={`radial_button_side ${selected ? 'selected' : ''}`} />
      </div>
    </div>
  )
}
