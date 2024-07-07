import { unzipSync } from 'fflate'
import { useEffect, useState } from 'react'
import { getModsFolder } from '../versionSwitcher/AmethystPaths'

const fs = window.require('fs') as typeof import('fs')
const path = window.require('path') as typeof import('path')

export default function DropWindow() {
	const [hovered, setHovered] = useState(false)

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
			file.file((blob) => {
				const reader = new FileReader()

				reader.onload = (event) => {
					const data = new Uint8Array(reader.result as ArrayBuffer)

					const unzipped = unzipSync(data)

					const modsFolderPath = getModsFolder()
					const modFolderPath = path.join(
						modsFolderPath,
						path.basename(file.name, path.extname(file.name))
					)

					for (const [filePath, fileContent] of Object.entries(
						unzipped
					)) {
						const absoluteFilePath = path.join(
							modFolderPath,
							filePath
						)

						if (!fs.existsSync(path.dirname(absoluteFilePath)))
							fs.mkdirSync(path.dirname(absoluteFilePath), {
								recursive: true,
							})

						if (absoluteFilePath.endsWith('\\')) {
							fs.mkdirSync(absoluteFilePath)
						} else {
							fs.writeFileSync(absoluteFilePath, fileContent)
						}
					}
				}

				reader.readAsArrayBuffer(blob)
			})
		}

		function importFolder(folder: FileSystemDirectoryEntry) {
			const modsFolderPath = getModsFolder()
			const modPath = path.join(modsFolderPath, folder.name)

			if (fs.existsSync(modPath))
				fs.rmdirSync(modPath, { recursive: true })

			fs.mkdirSync(modPath)

			saveFolderTo(modPath, folder)
		}

		function saveFolderTo(
			destination: string,
			folder: FileSystemDirectoryEntry
		) {
			const reader = folder.createReader()

			reader.readEntries((entries) => {
				for (const entry of entries) {
					if (entry.isFile) {
						;(entry as FileSystemFileEntry).file((blob) => {
							const reader = new FileReader()

							reader.onload = (event) => {
								const data = new Uint8Array(
									reader.result as ArrayBuffer
								)

								fs.writeFileSync(
									path.join(destination, entry.name),
									data
								)
							}

							reader.readAsArrayBuffer(blob)
						})
					} else {
						const folderPath = path.join(destination, entry.name)

						fs.mkdirSync(folderPath)

						saveFolderTo(
							folderPath,
							entry as FileSystemDirectoryEntry
						)
					}
				}
			})
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
