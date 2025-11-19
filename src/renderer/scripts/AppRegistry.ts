import { VersionsFolder } from './Paths'
import { MinecraftVersion } from './Versions'

import * as child from 'child_process'
import * as path from 'path'

// .node type so window.require is needed
const regedit = window.require('regedit-rs') as typeof import('regedit-rs')

export function HasGdkStableInstalled() {
  const reg_key =
    'HKCU\\SOFTWARE\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages'
  const listed = regedit.listSync(reg_key)
  if (!listed[reg_key].exists) return false

  const minecraftKey = listed[reg_key].keys.find(key => key.startsWith('MICROSOFT.MINECRAFTUWP_'))
  if (minecraftKey === undefined) return false

  const minecraftValues = regedit.listSync(`${reg_key}\\${minecraftKey}`)[`${reg_key}\\${minecraftKey}`]
  if (!minecraftValues.exists) return false

  console.log(minecraftValues);

  return true;
}

export function UnregisterGdkStable() {
  console.log("Unregistering GDK Stable Minecraft UWP version");
  const command = `powershell -ExecutionPolicy Bypass -Command "& {Get-AppxPackage Microsoft.MinecraftUWP | Remove-AppxPackage -PreserveRoamableApplicationData }"`
  RunCommand(command)
}

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

export async function RunCommand(command: string) {
  return new Promise<void>((resolve, reject) => {
    const exec_proc = child.exec(command)
    exec_proc.on('exit', exit_code => {
      if (exit_code === 0) {
        resolve()
      } else {
        reject(new Error(`Command failed with exit code ${exit_code}`))
      }
    })
  })
}

export async function UnregisterCurrent() {
  const packageId = GetPackageID()
  const unregisterCmd = `powershell -ExecutionPolicy Bypass -Command "& { Remove-AppxPackage -Package "${packageId}" -PreserveRoamableApplicationData }"`
  await RunCommand(unregisterCmd)
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
  const appxManifest = path.join(
    VersionsFolder,
    `Minecraft-${version.version.toString()}`,
    'AppxManifest.xml'
  )
  const registerCmd = `powershell -ExecutionPolicy Bypass -Command "& { Add-AppxPackage -Path '${appxManifest}' -Register }"`

  await new Promise<void>((resolve, reject) => {
    child.exec(registerCmd, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Registration failed: ${stderr || error.message}`))
        return
      }
      if (stderr) {
        reject(new Error(`Registration error: ${stderr}`))
        return
      }
      console.log(stdout) // optional: log PowerShell output
      resolve()
    })
  })

  console.log('Registered')
}