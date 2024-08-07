type RadialButtonProperties = {
  text: string
  value: string
  selected: boolean
  className?: string
  dark?: boolean
  onChange: (value: string) => void
}

export default function MinecraftRadialButton({
                                                text,
                                                value,
                                                selected,
                                                className,
                                                dark,
                                                onChange
                                              }: RadialButtonProperties) {
  return (
    <div className={`radial_button_base ${className}`} onClick={() => onChange(value)}>
      <div className={`radial_button_border ${selected ? 'selected' : ''} ${dark ? 'dark' : ''}`}>
        <div className={`radial_button_top ${selected ? 'selected' : ''} ${dark ? 'dark' : ''}`}>
          <p className={`radial_button_text ${selected ? 'selected' : ''} ${dark ? 'dark' : ''}`}>{text}</p>
        </div>
        <div className={`radial_button_side ${selected ? 'selected' : ''} ${dark ? 'dark' : ''}`} />
      </div>
    </div>
  )
}
