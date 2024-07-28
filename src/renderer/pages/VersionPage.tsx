import { GetVersions, RefreshVersionsFile, Version } from '../scripts/types/Version'
import { useState } from 'react'
import { ipcRenderer } from 'electron'
import PopupPanel from '../components/PopupPanel'
import { Console } from '../scripts/types/Console'

import * as fs from 'fs'
import * as child from 'child_process'
import Panel from '../components/Panel'
import ListItem from '../components/ListItem'
import List from '../components/List'

type VersionButtonProps = {
  version: Version
  onInspect: () => void
  onDelete: () => void
}

const VersionButton = ({ version, onInspect, onDelete }: VersionButtonProps) => {
  function DeleteVersion() {
    const message_args = {
      message: 'Are you sure you want to delete this version?\n\nThis is an irreversible action!',
      type: 'warning',
      buttons: ['Cancel', 'Confirm'],
      defaultId: 0,
      title: 'Delete Version',
      noLink: true
    }
    ipcRenderer.invoke('show-message', message_args).then((value: Electron.MessageBoxReturnValue) => {
      if (value.response === 0) return
      else if (value.response === 1) {
        // REMOVE VERSION
        if (version.path) {
          if (fs.existsSync(version.path)) {
            fs.rm(version.path, { recursive: true }, err => {
              if (err) {
                Console.Error((err as Error).message)
              } else {
                onDelete()
                Console.Group(Console.ActionStr(`Delete Version`), () => {
                  Console.Info(`Version: ${version.sem_version}`)
                  Console.Group(Console.InfoStr('Path'), () => {
                    console.log(version.path)
                  })
                })
              }
            })
          }
        }
      }
    })
  }

  function OpenVersionLocation() {
    if (version.path) {
      if (fs.existsSync(version.path)) {
        child.spawn(`explorer "${version.path}"`, { shell: true })
      }
    }
  }

  function InspectVersion() {
    onInspect()
  }

  return (
    <ListItem>
      <div className="flex flex-row w-full justify-between items-center">
        <div className="h-full flex flex-col justify-center items-center min-w-0 p-[8px]">
          <p className="minecraft-seven text-[#FFFFFF] text-[16px]">{version.sem_version}</p>
          {/*<p className="minecraft-seven text-[#B1B2B5] text-[14px] overflow-ellipsis overflow-hidden whitespace-nowrap">{"Path:"} ({version.path})</p>*/}
        </div>
        <div className="shrink-0 flex flex-row p-[8px] gap-[8px] justify-right items-center">
          <div
            className="shrink-0 cursor-pointer w-[24px] h-[24px] bg-[#333334] hover:bg-[#FF000080] box-content border-[3px] border-[#1E1E1F] rounded-[3px]"
            onClick={() => DeleteVersion()}
          >
            <img src="images/icons/delete-icon.png" className="w-full h-full pixelated" alt="" />
          </div>

          <div
            className="w-[24px] h-[24px] shrink-0 bg-[#313233] box-content border-[3px] border-[#1E1E1F] rounded-[3px] cursor-pointer hover:border-[#5a5b5c] hover:bg-[#48494A] active:border-[#4f913c] active:bg-[#3c8527]"
            onClick={() => OpenVersionLocation()}
          >
            <img src="images/icons/open-folder-icon.png" className="w-full h-full pixelated" alt="" />
          </div>

          <div
            className="w-[24px] h-[24px] shrink-0 bg-[#313233] box-content border-[3px] border-[#1E1E1F] rounded-[3px] cursor-pointer hover:border-[#5a5b5c] hover:bg-[#48494A] active:border-[#4f913c] active:bg-[#3c8527]"
            onClick={() => InspectVersion()}
          >
            <img src="images/icons/info-icon.png" className="w-full h-full pixelated" alt="" />
          </div>
        </div>
      </div>
    </ListItem>
  )
}

export default function VersionPage() {
  RefreshVersionsFile()
  const [versions, SetVersions] = useState<Version[]>(GetVersions())

  function RefreshVersions() {
    RefreshVersionsFile()
    SetVersions(GetVersions())
  }

  const [selected_version, SetSelectedVersion] = useState<Version | undefined>(undefined)

  return (
    <>
      <Panel>
        <div className="content_panel">
          <p className="minecraft-seven text-[#FFFFFF] text-[14px]">Version Manager</p>
          <List>
            {versions.map((version, index) => {
              return (
                <VersionButton
                  version={version}
                  onInspect={() => SetSelectedVersion(version)}
                  onDelete={() => RefreshVersions()}
                  key={index}
                />
              )
            })}
          </List>
        </div>
      </Panel>

      {selected_version && (
        <PopupPanel>
          <div className="flex flex-row w-full justify-between items-center border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
            <p className="minecraft-seven text-white text-[14px] max-w-[400px]">{selected_version.sem_version}</p>

            <div
              className="p-[4px] justify-center items-center ml-auto cursor-pointer"
              onClick={() => SetSelectedVersion(undefined)}
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
          <div className="flex flex-col w-full border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
            <p className="minecraft-seven text-[#BCBEC0] text-[12px] select-text">{selected_version.path}</p>
          </div>
          <div className="flex flex-col w-full border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
            <p className="minecraft-seven text-[#BCBEC0] text-[12px] select-text">{selected_version.uuid}</p>
          </div>
        </PopupPanel>
      )}
    </>
  )
}
