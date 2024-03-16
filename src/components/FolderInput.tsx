const remote = window.require("@electron/remote") as typeof import('@electron/remote');

export type FolderInputProps = {
    label: string,
    text: string,
    setPath: React.Dispatch<React.SetStateAction<string>>
}

export default function FolderInput({ label, text, setPath }: FolderInputProps) {
    return (
        <>
            <p className="minecraft-seven text-white text-[14px]">{ label }</p>
            <div className="flex items-center box-border border-[2px] border-[#1E1E1F] bg-[#313233]">
                <input
                    className="w-[90%] minecraft-seven outline-none bg-[#313233] text-white text-[14px] px-[4px]"


                    spellCheck={false} value={text} onInput={(event) => {
                        //@ts-ignore
                        setPath(event.target.value);
                    }}
                />

                <button
                    className="w-[10%] minecraft-seven outline-none box-border border-[1px] border-[#1E1E1F] border-l-3 bg-[#313233] text-white text-[14px] px-[4px]"
                    onClick={ async () => {
                        if(text !== "") return setPath("");

                        const showDialog = await remote.dialog.showOpenDialog({
                            properties: ['openDirectory']
                        });

                        const directory = showDialog.filePaths[0];
                        setPath(directory);
                    }}
                >
                    { text !== "" ? "X" : "Browse" }
                </button>
            </div>
        </>
    )
}