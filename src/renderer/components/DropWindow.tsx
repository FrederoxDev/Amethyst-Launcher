<<<<<<< HEAD:src/renderer/components/DropWindow.tsx
import { useEffect, useState } from 'react'
import { ModsFolder } from '../scripts/Paths'
import { useAppState } from '../contexts/AppState'
import { Extractor } from "../scripts/backend/Extractor";
import { CopyRecursive } from "../scripts/Files";
=======
import { unzipSync } from 'fflate'
import { useEffect, useState } from 'react'
import { getModsFolder } from '../versionSwitcher/AmethystPaths'
import { useAppState } from '../contexts/AppState'
>>>>>>> 035b376ad437fffcbc68bc32b9ec642c1a1c2c97:src/components/DropWindow.tsx

const fs = window.require('fs') as typeof import('fs')
const path = window.require('path') as typeof import('path')

export default function DropWindow() {
<<<<<<< HEAD:src/renderer/components/DropWindow.tsx
    const [hovered, setHovered] = useState(false)

    const { setError } = useAppState()



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
                const zip_name = path.basename(zip_path);
                const extracted_folder_path = path.join(ModsFolder, zip_name.slice(0, -'.zip'.length));
                console.log(extracted_folder_path);
                Extractor.extractFile(zip_path, extracted_folder_path, [], undefined, (success => {
                    if (!success) {
                        throw new Error("There was an error while extracting Mod ZIP!");
                    }

                    console.log("Successfully extracted Mod ZIP!")
                })).then()
            } catch (error) {
                setError((error as Error).message)
            }
        }

        // IMPORT FOLDER
        function ImportFolder(folder_path: string) {
            try {
                CopyRecursive(folder_path, ModsFolder);
            } catch (error) {
                setError((error as Error).message)
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
    }, [setError])

    return (
        <div className={`absolute w-full h-full top-0 left-0 pointer-events-none ${hovered ? 'opacity-100' : 'opacity-0'} transition-opacity ease-out duration-150`}>
            <div className="absolute pointer-events-none w-full h-full bg-black top-0 left-0 opacity-80" />

            <h1 className="minecraft-seven pointer-events-none text-white absolute left-1/2 top-1/2 translate-x-[-50%] translate-y-[-50%]">
                Drop mod .zip or folder to import
            </h1>
        </div>
    )
}
=======
	const [hovered, setHovered] = useState(false)

	const { setStatus, setError, setErrorType } = useAppState()

	let dragCount = 0

	useEffect(() => {
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

			const items = event.dataTransfer.items

			for (const item of items) {
				const entry = item.webkitGetAsEntry()

				if (!entry) continue

				if (entry.isFile) importZip(entry as FileSystemFileEntry)
				if (entry.isDirectory)
					importFolder(entry as FileSystemDirectoryEntry)
			}
		}

		function importZip(file: FileSystemFileEntry) {
			try {
				file.file((blob) => {
					try {
						const reader = new FileReader()

						reader.onload = (event) => {
							try {
								const data = new Uint8Array(
									reader.result as ArrayBuffer
								)

								const unzipped = unzipSync(data)

								const modsFolderPath = getModsFolder()
								const modFolderPath = path.join(
									modsFolderPath,
									path.basename(
										file.name,
										path.extname(file.name)
									)
								)

								if (fs.existsSync(modFolderPath))
									fs.rmSync(modFolderPath, {
										recursive: true,
									})

								for (const [
									filePath,
									fileContent,
								] of Object.entries(unzipped)) {
									const absoluteFilePath = path.join(
										modFolderPath,
										filePath
									)

									if (
										!fs.existsSync(
											path.dirname(absoluteFilePath)
										)
									)
										fs.mkdirSync(
											path.dirname(absoluteFilePath),
											{
												recursive: true,
											}
										)

									if (absoluteFilePath.endsWith('\\')) {
										fs.mkdirSync(absoluteFilePath)
									} else {
										fs.writeFileSync(
											absoluteFilePath,
											fileContent
										)
									}
								}
							} catch (error) {
								setError((error as Error).message)
								setErrorType('import')
								setStatus('')
							}
						}

						reader.readAsArrayBuffer(blob)
					} catch (error) {
						setError((error as Error).message)
						setErrorType('import')
						setStatus('')
					}
				})
			} catch (error) {
				setError((error as Error).message)
				setErrorType('import')
				setStatus('')
			}
		}

		function importFolder(folder: FileSystemDirectoryEntry) {
			try {
				const modsFolderPath = getModsFolder()
				const modPath = path.join(modsFolderPath, folder.name)

				if (fs.existsSync(modPath))
					fs.rmSync(modPath, { recursive: true })

				fs.mkdirSync(modPath)

				saveFolderTo(modPath, folder)
			} catch (error) {
				setError((error as Error).message)
				setErrorType('import')
				setStatus('')
			}
		}

		function saveFolderTo(
			destination: string,
			folder: FileSystemDirectoryEntry
		) {
			try {
				const reader = folder.createReader()

				reader.readEntries((entries) => {
					try {
						for (const entry of entries) {
							if (entry.isFile) {
								;(entry as FileSystemFileEntry).file((blob) => {
									try {
										const reader = new FileReader()

										reader.onload = (event) => {
											try {
												const data = new Uint8Array(
													reader.result as ArrayBuffer
												)

												fs.writeFileSync(
													path.join(
														destination,
														entry.name
													),
													data
												)
											} catch (error) {
												setError(
													(error as Error).message
												)
												setErrorType('import')
												setStatus('')
											}
										}

										reader.readAsArrayBuffer(blob)
									} catch (error) {
										setError((error as Error).message)
										setErrorType('import')
										setStatus('')
									}
								})
							} else {
								const folderPath = path.join(
									destination,
									entry.name
								)

								fs.mkdirSync(folderPath)

								saveFolderTo(
									folderPath,
									entry as FileSystemDirectoryEntry
								)
							}
						}
					} catch (error) {
						setError((error as Error).message)
						setErrorType('import')
						setStatus('')
					}
				})
			} catch (error) {
				setError((error as Error).message)
				setErrorType('import')
				setStatus('')
			}
		}

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
	}, [])

	return (
		<div
			className={`absolute w-full h-full top-0 left-0 pointer-events-none ${
				hovered ? 'opacity-100' : 'opacity-0'
			} transition-opacity ease-out duration-150`}
		>
			<div className="absolute pointer-events-none w-full h-full bg-black top-0 left-0 opacity-80" />

			<h1 className="minecraft-seven pointer-events-none text-white absolute left-1/2 top-1/2 translate-x-[-50%] translate-y-[-50%]">
				Drop mod .zip or folder to import
			</h1>
		</div>
	)
}
>>>>>>> 035b376ad437fffcbc68bc32b9ec642c1a1c2c97:src/components/DropWindow.tsx
