import { useEffect, useState } from 'react'
import Panel from '../components/Panel'
import MinecraftButton from '../components/MinecraftButton'
import { FolderPaths } from '../scripts/Paths'

import { ValidateMod, ModConfig } from '../scripts/Mods'
import PopupPanel from '../components/PopupPanel'

import * as fs from 'fs'
import * as path from 'path'
import * as child from 'child_process'
import List from '../components/List'
import ListItem from '../components/ListItem'

type ModErrorInfo = { modIdentifier: string; description?: string; modErrors: string[] }

function getAllMods(): ModErrorInfo[] {
  const results: ModErrorInfo[] = []

  if (!fs.existsSync(FolderPaths.Mods)) return results

  const allModNames = fs
    .readdirSync(FolderPaths.Mods, { withFileTypes: true })
    .filter(f => f.isDirectory())
    .map(dir => dir.name)

  for (const modIdentifier of allModNames) {
    const modErrors: string[] = []

    // Config data
    let modConfig: ModConfig = {
      meta: {
        author: '',
        name: '',
        version: ''
      }
    }

    // Validate that it has a config file
    const modConfigPath = path.join(FolderPaths.Mods, modIdentifier, 'mod.json')

    if (!fs.existsSync(modConfigPath)) {
      modErrors.push(`Missing mod.json configuration file inside mod folder.`)
    } else {
      try {
        const configData = fs.readFileSync(modConfigPath, 'utf-8')
        const configParsed = JSON.parse(configData)
        modConfig = ValidateMod(configParsed, modErrors)
      } catch {
        modErrors.push(`Failed to parse the mod.json configuration file, invalid json?`)
      }
    }

    results.push({
      modIdentifier: modConfig.meta.name,
      description: modConfig.meta.description ?? '',
      modErrors
    })
  }

  return results
}

const openModsFolder = () => {
  // Don't reveal in explorer unless there is an existing minecraft folder
  if (!fs.existsSync(FolderPaths.MinecraftUWP)) {
    alert('Minecraft is not currently installed')
    return
  }

  if (!fs.existsSync(FolderPaths.Mods)) fs.mkdirSync(FolderPaths.Mods, { recursive: true })

  const startGameCmd = `explorer "${FolderPaths.Mods}"`
  child.spawn(startGameCmd, { shell: true })
}

export default function ModsPage() {
  /** Page which will display information about each folder in the 'mods' directory. */
  /** Will report any errors and why they are not valid to select etc */
  /** Todo make this popup a panel after a more info button is pressed or something */

  const [allReports, setAllReports] = useState<ModErrorInfo[]>([])
  const [selectedReport, setSelectedReport] = useState<ModErrorInfo | undefined>(undefined)

  useEffect(() => {
    setAllReports(getAllMods())
  }, [])

  return (
    <>
      <Panel>
        <div className="content_panel">
          <p className="minecraft-seven text-white text-[14px]">Mod Manager</p>
          <List>
            {allReports.map((report, index) => (
              <ListItem className="cursor-pointer" onClick={() => setSelectedReport(report)} key={index}>
                <div className="p-[8px]">
                  <p className="minecraft-seven text-white text-[14px] px-[4px]">{report.modIdentifier}</p>
                  <p className="minecraft-seven text-[#B1B2B5] text-[14px] px-[4px]">{report.description}</p>
                  {report.modErrors.length > 0 && (
                    <p className="minecraft-seven text-red-400 text-[14px] px-[4px]">
                      {report.modErrors.length} Errors!
                    </p>
                  )}
                  {report.modErrors.length === 0 && (
                    <p className="minecraft-seven text-[#BCBEC0] text-[14px] px-[4px]">No Errors</p>
                  )}
                </div>
              </ListItem>
            ))}
          </List>
          <div className="w-full h-fit">
            <MinecraftButton text="Open Mods Folder" onClick={openModsFolder} />
          </div>
        </div>
      </Panel>

      {selectedReport && (
        <PopupPanel onExit={() => setSelectedReport(undefined)}>
          <div className="w-[500px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
            <div className="flex">
              <p className="minecraft-seven text-white text-[14px] max-w-[400px]">{selectedReport.modIdentifier}</p>
              <div
                className="p-[4px] justify-center items-center ml-auto cursor-pointer"
                onClick={() => setSelectedReport(undefined)}
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <polygon
                    className="fill-[#FFFFFF]"
                    fillRule="evenodd"
                    points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
                  />
                </svg>
              </div>
            </div>

            <p className="minecraft-seven text-[#BCBEC0] text-[12px] max-w-[400px]">
              {selectedReport.description ?? ''}
            </p>
          </div>
          {selectedReport.modErrors.length > 0 ? (
            <div className="w-[500px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
              <p className="minecraft-seven text-white text-[12px]">Errors:</p>
              <ul>
                {selectedReport.modErrors.map(err => (
                  <li className="minecraft-seven text-red-400 text-[12px]" key={err}>
                    - {err}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="w-[500px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
              <p className="minecraft-seven text-white text-[12px]">No issues detected!</p>
            </div>
          )}
        </PopupPanel>
      )}
    </>
  )
}
