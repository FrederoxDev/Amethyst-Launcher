import { VersionsFolder } from './Paths'
import { MinecraftVersion } from './Versions'

import * as child from 'child_process'
import * as path from 'path'
import { SemVersion } from './classes/SemVersion'

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
  console.log('Currently installed packageId', packageId)
  if (packageId === undefined) return

  const unregisterCmd = `powershell -ExecutionPolicy Bypass -Command "& { Remove-AppxPackage -Package "${packageId}" -PreserveRoamableApplicationData }"`
  await new Promise(resolved => {
    const exec_proc = child.exec(unregisterCmd)

    exec_proc.on('exit', exit_code => {
      resolved(exit_code)
    })
  })
  console.log('Unregistered')
}

export async function RegisterVersion(version: MinecraftVersion) {
  // Make sure no version is currently registered
  if (GetPackageID() !== undefined) {
    await UnregisterCurrent()
    if (GetPackageID() !== undefined) {
      throw new Error('There is still a version installed!')
    }
  }

  // Register New Version
  const appxManifest = path.join(VersionsFolder, `Minecraft-${SemVersion.toString(version.version)}`, 'AppxManifest.xml')
  const registerCmd = `powershell -ExecutionPolicy Bypass -Command "& { Add-AppxPackage -Path "${appxManifest}" -Register }"`
  await new Promise(resolved => {
    const exec_proc = child.exec(registerCmd)

    exec_proc.on('exit', exit_code => {
      resolved(exit_code)
    })
  })
  console.log('Registered')
}
