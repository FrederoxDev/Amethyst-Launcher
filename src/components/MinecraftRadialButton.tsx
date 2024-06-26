type RadialButtonProperties = {
    text: string,
    selected: boolean,
    onChange: (text: string) => void
}

export default function MinecraftRadialButton({text, selected, onChange}: RadialButtonProperties) {
    return (
        <div className="w-full h-full m-[8px]">
            <div className="h-[51px]" onClick={() => onChange(text)}>

                <div className={`border-[3px] border-[#1E1E1F] cursor-pointer ${selected ? "translate-y-[4px] h-[46px]" : "h-full" }`}>

                    {
                        selected ?

                            <div className="relative border-[3px] h-[40px] box-border flex items-center justify-center border-[#4F913C] bg-[#3C8527]">
                                <p className="minecraft-seven text-[16px] text-white">{text}</p>
                                <div className="absolute bg-[#FFFFFF] h-[3px] w-[60px] bottom-[-3px]"/>
                            </div>
                            

                        :

                        <div className="border-[3px] h-[40px] box-border flex items-center justify-center border-[#e3e3e5] bg-[#d0d1d4] hover:bg-[#b1b2b5]">
                            <p className="minecraft-seven text-[16px] text-[#1e1e1f]">{text}</p>
                        </div>
                    }


                    <div className={`box-border bg-[#58585a] ${selected ? "h-[0px]" : "h-[5px]" }`}/>

                </div>

            </div>

        </div>
    )
}