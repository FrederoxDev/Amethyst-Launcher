import { FolderPaths } from '../Paths'

import { Version } from '../types/Version'

import * as child from 'child_process'
import * as path from 'path'
import { Console } from '../types/Console'

// .node type so window.require is needed
const regedit = window.require('regedit-rs') as typeof import('regedit-rs')

export function GetPackage() {
  const reg_key =
    'HKCU\\SOFTWARE\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages'
  const listed = regedit.listSync(reg_key)
  if (!listed[reg_key].exists) return undefined

  const minecraftKey = listed[reg_key].keys.find(key => key.startsWith('Microsoft.MinecraftUWP_'))
  if (minecraftKey === undefined) return undefined

  const minecraftValues = regedit.listSync(`${reg_key}\\${minecraftKey}`)[`${reg_key}\\${minecraftKey}`]
  if (!minecraftValues.exists) return undefined

  return minecraftValues
}

export function GetPackagePath() {
  return GetPackage()?.values['PackageRootFolder'].value as string
}

export function GetPackageID() {
  return GetPackage()?.values['PackageID'].value as string
}

export async function UnregisterCurrent() {
  const packageId = GetPackageID()

  if (packageId === undefined) return

  Console.StartGroup(Console.ActionStr('Unregister Version'))
  {
    Console.Group(Console.InfoStr('PackageID'), () => {
      console.log(packageId)
    })

    const unregisterCmd = `powershell -ExecutionPolicy Bypass -Command "& { Remove-AppxPackage -Package "${packageId}" -PreserveRoamableApplicationData }"`
    await new Promise(resolved => {
      const exec_proc = child.exec(unregisterCmd)

      exec_proc.on('exit', exit_code => {
        resolved(exit_code)
      })
    })

    if (GetPackageID() !== undefined) {
      Console.Group(Console.ResultStr('Failed', true), () => {
        Console.Error('Incorrect version is still registered')
      })
    } else {
      Console.Result('Successful')
    }
  }
  Console.EndGroup()
}

export async function RegisterVersion(version: Version) {
  if (version.path) {
    // Make sure no version is currently registered
    if (GetPackageID() !== undefined) {
      await UnregisterCurrent()
      if (GetPackageID() !== undefined) {
        throw new Error('Incorrect version is still registered')
      }
    }

    Console.StartGroup(Console.ActionStr('Register Version'))
    {

      // Register New Version
      const appxManifest = path.join(version.path, version.sem_version, 'AppxManifest.xml')

      Console.Group(Console.InfoStr('AppxManifest'), () => {
        console.log(appxManifest)
      })

      const registerCmd = `powershell -ExecutionPolicy Bypass -Command "& { Add-AppxPackage -Path '${appxManifest}' -Register }"`
      await new Promise(resolved => {
        const exec_proc = child.exec(registerCmd)

        exec_proc.on('error', (err) => {
          console.log(err)
        })

        exec_proc.on('exit', exit_code => {
          resolved(exit_code)
        })
      })

      Console.Result('Successful')
    }
    Console.EndGroup()

    console.log(GetPackagePath())
  }
  else {
    throw new Error('Version path is undefined')
  }
}
