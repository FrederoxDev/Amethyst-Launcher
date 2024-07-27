import { SemVersion } from '../types/SemVersion'
import { FolderPaths, ValidatePath, DeletePath } from '../Paths'
import { GetPackagePath } from './AppRegistry'
import { Extractor } from '../backend/Extractor'
import { download } from '../backend/MinecraftVersionDownloader'
import { Version } from '../types/Version'
import { Console } from '../types/Console'
import React from 'react'

import * as fs from 'fs'
import * as path from 'path'

export function IsDownloaded(version: SemVersion) {
  const version_path = path.join(FolderPaths.Versions, `Minecraft-${SemVersion.toPrimitive(version)}`)
  return fs.existsSync(version_path)
}

export function IsLocked(version: SemVersion) {
  const lock_path = path.join(FolderPaths.Versions, `Minecraft-${SemVersion.toPrimitive(version)}.lock`)
  return fs.existsSync(lock_path)
}

export function CreateLock(version: SemVersion) {
  const lock_path = path.join(FolderPaths.Versions, `Minecraft-${SemVersion.toPrimitive(version)}.lock`)
  ValidatePath(lock_path)
  const handle = fs.openSync(lock_path, 'w')
  fs.close(handle)
}

export function CleanupInstall(version: SemVersion, successful: boolean) {
  const appxPath = path.join(FolderPaths.Versions, `Minecraft-${SemVersion.toPrimitive(version)}.zip`)
  const lockPath = path.join(FolderPaths.Versions, `Minecraft-${SemVersion.toPrimitive(version)}.lock`)
  DeletePath(appxPath)
  DeletePath(lockPath)

  if (!successful) {
    const folderPath = path.join(FolderPaths.Versions, `Minecraft-${SemVersion.toPrimitive(version)}`)
    DeletePath(folderPath)
  }
}

export async function DownloadVersion(
  version: Version,
  setStatus: React.Dispatch<React.SetStateAction<string>>,
  setLoadingPercent: React.Dispatch<React.SetStateAction<number>>
) {
  ValidatePath(FolderPaths.Versions)

  const outputFile = path.join(FolderPaths.Versions, `Minecraft-${version.sem_version}.zip`)

  Console.Group(Console.InfoStr('File'), () => {
    console.log(outputFile)
  })

  const toMB = (bytes: number) => {
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)}MB`
  }

  const start_time = performance.now()

  setLoadingPercent(0)

  await download(
    version.uuid,
    '1',
    outputFile,
    (transferred, totalSize) => {
      setStatus(`Downloading: ${toMB(transferred)} / ${toMB(totalSize)}`)
      setLoadingPercent(transferred / totalSize)
    },
    success => {
      if (!success) {
        setStatus('')
        Console.Group(Console.ResultStr('Failed', true), () => {
          Console.Error('Version download failed')
        })
        throw new Error('Failed to download Minecraft!')
      }
      const end_time = performance.now()
      Console.Group(Console.ResultStr('Successful'), () => {
        Console.Info(`Elapsed Time: ${Math.round((end_time - start_time + Number.EPSILON) * 100) / 100}ms`)
      })
    }
  )
}

export async function ExtractVersion(
  version: Version,
  setStatus: React.Dispatch<React.SetStateAction<string>>,
  setLoadingPercent: React.Dispatch<React.SetStateAction<number>>
) {
  const appxPath = path.join(FolderPaths.Versions, `Minecraft-${version.sem_version}.zip`)
  const folderPath = path.join(FolderPaths.Versions, `Minecraft-${version.sem_version}`)

  Console.Group(Console.InfoStr('File'), () => {
    console.log(appxPath)
  })

  Console.Group(Console.InfoStr('Folder'), () => {
    console.log(folderPath)
  })

  const excludes = [
    'AppxMetadata/CodeIntegrity.cat',
    'AppxMetadata',
    'AppxBlockMap.xml',
    'AppxSignature.p7x',
    '[Content_Types].xml'
  ]

  setLoadingPercent(0)

  const start_time = performance.now()

  await Extractor.extractFile(
    appxPath,
    folderPath,
    excludes,
    (fileIndex, totalFiles, fileName) => {
      setLoadingPercent(fileIndex / totalFiles)
      setStatus(`Extracting: ${fileName}`)
    },
    success => {
      if (!success) {
        Console.Group(Console.ResultStr('Failed', true), () => {
          Console.Error('Version extract failed')
        })
        throw new Error('Version extract failed')
      }

      const end_time = performance.now()

      Console.Group(Console.ResultStr('Successful'), () => {
        Console.Info(`Elapsed Time: ${Math.round((end_time - start_time + Number.EPSILON) * 100) / 100}ms`)
      })
      setStatus('Successfully extracted the downloaded version!')
    }
  )
}

export function InstallProxy(version: Version) {
  const target_path = path.join(
    FolderPaths.Versions,
    `Minecraft-${version.sem_version}`,
    'dxgi.dll'
  )
  const proxy_path = path.join(FolderPaths.App, 'build/public/proxy/dxgi.dll')

  fs.copyFileSync(proxy_path, target_path)
}

export function IsRegistered(version: Version) {
  const fileName = `Minecraft-${version.sem_version}`

  return GetPackagePath() === `${FolderPaths.Versions}\\${fileName}`
}
