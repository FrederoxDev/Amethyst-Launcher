import { FolderPaths, ValidatePath, DeletePath } from '../Paths'
import { GetPackagePath } from './AppRegistry'
import { Extractor } from '../backend/Extractor'
import { download } from '../backend/MinecraftVersionDownloader'
import { Version } from '../types/Version'
import { Console } from '../types/Console'
import React from 'react'

import * as fs from 'fs'
import * as path from 'path'

export function IsDownloaded(version: Version) {
  if (version.path) {
    const version_path = path.join(version.path, version.sem_version)
    return fs.existsSync(version_path)
  }
  else {
    throw new Error('Version path is undefined')
  }
}

export function IsLocked(version: Version) {
  if (version.path) {
    const lock_path = path.join(version.path, `${version.sem_version}.lock`)
    return fs.existsSync(lock_path)
  }
  else {
    throw new Error('Version path is undefined')
  }
}

export function CreateLock(version: Version) {
  if (version.path) {
    const lock_path = path.join(version.path, `${version.sem_version}.lock`)
    ValidatePath(lock_path)
    const handle = fs.openSync(lock_path, 'w')
    fs.close(handle)
  }
  else {
    throw new Error('Version path is undefined')
  }
}

export function CleanupInstall(version: Version, successful: boolean) {
  if (version.path) {
    const appxPath = path.join(version.path, `${version.sem_version}.zip`)
    const lockPath = path.join(version.path, `${version.sem_version}.lock`)
    DeletePath(appxPath)
    DeletePath(lockPath)

    if (!successful) {
      const folderPath = path.join(version.path, version.sem_version)
      DeletePath(folderPath)
    }
  }
  else {
    throw new Error('Version path is undefined')
  }
}

export async function DownloadVersion(
  version: Version,
  setStatus: React.Dispatch<React.SetStateAction<string>>,
  setLoadingPercent: React.Dispatch<React.SetStateAction<number>>
) {
  if (version.path) {
    ValidatePath(version.path)

    const output_file = path.join(version.path, `${version.sem_version}.zip`)

    Console.Group(Console.InfoStr('File'), () => {
      console.log(output_file)
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
      output_file,
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
  else {
    throw new Error('Version path is undefined')
  }
}

export async function ExtractVersion(
  version: Version,
  setStatus: React.Dispatch<React.SetStateAction<string>>,
  setLoadingPercent: React.Dispatch<React.SetStateAction<number>>
) {
  if (version.path) {
    const appxPath = path.join(version.path, `${version.sem_version}.zip`)
    const folderPath = path.join(version.path, version.sem_version)

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
  else {
    throw new Error('Version path is undefined')
  }
}

export function InstallProxy(version: Version) {
  if (version.path) {
    const target_path = path.join(version.path, version.sem_version, 'dxgi.dll')
    const proxy_path = path.join(FolderPaths.App, 'build/public/proxy/dxgi.dll')

    fs.copyFileSync(proxy_path, target_path)
  }
  else {
    throw new Error('Version path is undefined')
  }
}

export function IsRegistered(version: Version) {
  if (version.path) {
    console.log(path.join(version.path, version.sem_version))
    console.log(GetPackagePath())
    return GetPackagePath() === path.join(version.path, version.sem_version)
  }
  else {
    throw new Error('Version path is undefined')
  }
}
