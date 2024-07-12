import { useEffect, useState } from 'react'
import { ModsFolder } from '../scripts/Paths'
import { useAppState } from '../contexts/AppState'
import { Extractor } from "../scripts/backend/Extractor";
import { CopyRecursive } from "../scripts/Files";

const fs = window.require('fs') as typeof import('fs')
// const path = window.require('path') as typeof import('path')

export default function DropWindow() {
    const [hovered, setHovered] = useState(false)

    const { setStatus, setError} = useAppState()



    useEffect(() => {
        let dragCount = 0

        // DRAG EVENTS
        function dragOver(event: DragEvent) {
            event.preventDefault()
        }

        function dragStart(event: DragEvent) {
            event.preventDefault()

            if (dragCount === 0) setHovered(true)

            dragCount++
        }

        function dragEnd(event: DragEvent) {
            event.preventDefault()

            dragCount--

            if (dragCount === 0) setHovered(false)
        }

        function drop(event: DragEvent) {
            event.preventDefault()

            setHovered(false)

            dragCount = 0

            if (!event.dataTransfer) return

            const items = event.dataTransfer.files

            for (const file of items) {
                const file_path: string = file.path;

                if (fs.lstatSync(file_path).isDirectory()) {
                    ImportFolder(file_path)
                }
                else if (fs.lstatSync(file_path).isFile()) {
                    ImportZIP(file_path)
                }
                else {
                    console.error('File path does not point to a file or directory!')
                }
            }
        }

        // IMPORT ZIP
        function ImportZIP(zip_path: string) {
            try {
                Extractor.extractFile(zip_path, ModsFolder, [], undefined, (success => {
                    if (!success) {
                        throw new Error("There was an error while extracting Mod ZIP!");
                    }

                    console.log("Successfully extracted Mod ZIP!")
                    setStatus("Successfully extracted Mod ZIP!")
                })).then()
            } catch (error) {
                setError((error as Error).message)
                setStatus('')
            }
        }

        // IMPORT FOLDER
        function ImportFolder(folder_path: string) {
            try {
                CopyRecursive(folder_path, ModsFolder);
            } catch (error) {
                setError((error as Error).message)
                setStatus('')
            }
        }

        // EVENT LISTENERS
        window.addEventListener('dragover', dragOver)
        window.addEventListener('dragenter', dragStart)
        window.addEventListener('dragleave', dragEnd)
        window.addEventListener('drop', drop)

        return () => {
            window.removeEventListener('dragover', dragOver)
            window.removeEventListener('dragenter', dragStart)
            window.removeEventListener('dragleave', dragEnd)
            window.removeEventListener('drop', drop)
        }
    }, [setError, setStatus])

    return (
        <div className={`absolute w-full h-full top-0 left-0 pointer-events-none ${hovered ? 'opacity-100' : 'opacity-0'} transition-opacity ease-out duration-150`}>
            <div className="absolute pointer-events-none w-full h-full bg-black top-0 left-0 opacity-80" />

            <h1 className="minecraft-seven pointer-events-none text-white absolute left-1/2 top-1/2 translate-x-[-50%] translate-y-[-50%]">
                Drop mod .zip or folder to import
            </h1>
        </div>
    )
}