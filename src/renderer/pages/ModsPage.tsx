import * as fs from 'fs'
import * as child from 'child_process'
import {MainPanel} from '../components/MainPanel'
import {MinecraftButton} from '../components/MinecraftButton'
import {PopupPanel} from '../components/PopupPanel'
import { useEffect, useState } from 'react'
import { GetAllMods, ValidatedMod } from '../scripts/Mods'
import { MinecraftUWPFolder, ModsFolder } from '../scripts/Paths'

const openModsFolder = () => {
  // Don't reveal in explorer unless there is an existing minecraft folder
  if (!fs.existsSync(MinecraftUWPFolder)) {
    alert('Minecraft is not currently installed')
    return
  }

  if (!fs.existsSync(ModsFolder)) fs.mkdirSync(ModsFolder, { recursive: true })

  const startGameCmd = `explorer "${ModsFolder}"`
  child.spawn(startGameCmd, { shell: true })
}

export function ModsPage() {
  /** Page which will display information about each folder in the 'mods' directory. */
  /** Will report any errors and why they are not valid to select etc */
  /** Todo make this popup a panel after a more info button is pressed or something */

  const [allReports, setAllReports] = useState<ValidatedMod[]>([])
  const [selectedReport, setSelectedReport] = useState<ValidatedMod | undefined>(undefined)

  useEffect(() => {
    setAllReports(GetAllMods())
  }, [])

  return (
    <>
      <MainPanel>
        <div className="flex flex-col gap-[8px] h-full p-[8px] bg-[#48494A] border-[3px] border-[#1E1E1F]">
          <p className="minecraft-seven text-white text-[14px]">Mod Manager</p>
          <div className="flex flex-col gap-[3px] border-[3px] border-[#1E1E1F] h-full bg-[#313233] overflow-y-auto overflow-x-hidden scrollbar">
            {allReports.map(report => (
              <div
                className="m-[-3px] border-[3px] border-[#1E1E1F]"
                onClick={() => {
                  setSelectedReport(report)
                }}
                key={report.id}
              >
                <div className="cursor-pointer border-[3px] border-t-[#5a5b5c] border-l-[#5a5b5c] border-b-[#333334] border-r-[#333334] bg-[#48494a] p-[8px]">
                  <p className="minecraft-seven text-white text-[14px] px-[4px]">{report.id}</p>
                  {/* <p className="minecraft-seven text-[#B1B2B5] text-[14px] px-[4px]">{report.description}</p> */}
                  {report.errors.length > 0 && (
                    <p className="minecraft-seven text-red-400 text-[14px] px-[4px]">{report.errors.length} Errors!</p>
                  )}
                  {report.errors.length === 0 && (
                    <p className="minecraft-seven text-[#BCBEC0] text-[14px] px-[4px]">No Errors</p>
                  )}
                  {report.warnings.length > 0 && (
                    <p className="minecraft-seven text-yellow-400 text-[14px] px-[4px]">{report.warnings.length} Warnings!</p>
                  )}
                  {report.warnings.length === 0 && (
                    <p className="minecraft-seven text-[#BCBEC0] text-[14px] px-[4px]">No Warnings</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="w-full h-fit">
            <MinecraftButton text="Open Mods Folder" onClick={openModsFolder} />
          </div>
        </div>
      </MainPanel>
      {selectedReport && (
        <PopupPanel onExit={() => setSelectedReport(undefined)}>
          <div className="flex flex-col items-center justify-center border-[3px] border-[#1E1E1F]">
          <div className="w-[500px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
            <div className="flex">
              <p className="minecraft-seven text-white text-[14px] max-w-[400px]">{selectedReport.id}</p>
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
          </div>
          {selectedReport.errors.length > 0 ? (
            <div className="w-[500px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
              <p className="minecraft-seven text-white text-[12px]">Errors:</p>
              <ul>
                {selectedReport.errors.map(err => (
                  <li className="minecraft-seven text-red-400 text-[12px]" key={err}>
                    - {err}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="w-[500px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
              <p className="minecraft-seven text-white text-[12px]">No errors detected!</p>
            </div>
          )}
          {selectedReport.warnings.length > 0 ? (
            <div className="w-[500px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
              <p className="minecraft-seven text-white text-[12px]">Warnings:</p>
              <ul>
                {selectedReport.warnings.map(err => (
                  <li className="minecraft-seven text-yellow-400 text-[12px]" key={err}>
                    - {err}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="w-[500px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
              <p className="minecraft-seven text-white text-[12px]">No errors detected!</p>
            </div>
          )}
          </div>
        </PopupPanel>
      )}
    </>
  )
}
