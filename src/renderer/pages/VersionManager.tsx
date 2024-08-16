import { GetVersions, RefreshVersionsFile, Version } from '../scripts/types/Version'
import React, { useState } from 'react'
import { clipboard, ipcRenderer } from 'electron'
import { Console } from '../scripts/types/Console'

import * as fs from 'fs'
import path from 'path'

export default function VersionManager() {
  RefreshVersionsFile()
  const [versions, SetVersions] = useState<Version[]>(GetVersions())

  function RefreshVersions() {
    RefreshVersionsFile()
    SetVersions(GetVersions())
  }

  const [selected_version, SetSelectedVersion] = useState<number | undefined>(undefined)

  const VersionButton = (
    version: Version,
    index: number,
    selected_index: number | undefined,
    SetSelectedIndex: (index: number | undefined) => void,
    OnDelete: () => void
  ) => {
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
            const v_path = path.join(version.path, Version.toString(version))

            if (fs.existsSync(v_path)) {
              fs.rm(v_path, { recursive: true }, err => {
                if (err) {
                  Console.Error((err as Error).message)
                } else {
                  OnDelete()
                  Console.Group(Console.ActionStr(`Delete Version`), () => {
                    Console.Info(`Version: ${Version.toString(version)}`)
                    Console.Group(Console.InfoStr('Path'), () => {
                      console.log(v_path)
                    })
                  })
                }
              })
            }
          }
        }
      })
    }

    let version_format = 'Release'

    if (version.format === Version.Format.Beta) version_format = 'Beta'
    if (version.format === Version.Format.Preview) version_format = 'Preview'

    return (
      <div key={index}>
        <div className="list_item flex flex-row">
          <div
            className="flex flex-grow inset_button cursor-pointer"
            onClick={() => {
              SetSelectedIndex(selected_index === index ? undefined : index)
            }}
          >
            <div className="flex flex-row w-full justify-between items-center p-[8px]">
              <div className="flex flex-row gap-[8px]">
                <p className="minecraft-seven text-white text-[14px]">{version.sem_version}</p>
                <p className="minecraft-seven text-[#B1B2B5] text-[14px]">{version_format}</p>
              </div>
              <div className="w-[30px] h-[30px] p-[10px]">
                <img
                  src={selected_index === index ? `images/icons/chevron-up.png` : `images/icons/chevron-down.png`}
                  className="w-full h-full pixelated"
                  alt=""
                />
              </div>
            </div>
          </div>
          <div
            className="w-[58px] h-[58px] p-[8px] flex justify-center items-center inset_button cursor-pointer"
            onClick={() => DeleteVersion()}
          >
            <img src="images/icons/delete-icon.png" className="pixelated" alt="" />
          </div>
        </div>
        <div
          className={`flex flex-col p-[8px] bg-[#313233] border-[3px] m-[-3px] border-[#1e1e1f] overflow-hidden ${selected_index === index ? '' : 'hidden'}`}
        >
          <p className="minecraft-seven text-[#B1B2B5] text-[14px] leading-tight min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
            {`UUID: ${version.uuid}`}
          </p>
          <p className="minecraft-seven text-[#B1B2B5] text-[14px] leading-tight min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
            {'Version: ' + version.sem_version}
          </p>
          <p className="minecraft-seven text-[#B1B2B5] text-[14px] leading-tight min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
            {'Format: ' + version.format}
          </p>
          {version.path !== undefined && (
            <div className="flex flex-row justify-between">
              <p className="minecraft-seven text-[#B1B2B5] text-[14px] leading-tight min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
                {'Path: ' + version.path}
              </p>
              <div
                className="w-[24px] h-[24px] shrink-0 bg-[#313233] box-content border-[3px] border-[#1E1E1F] rounded-[3px] cursor-pointer hover:border-[#48494A] hover:bg-[#5a5b5c] active:border-[#4f913c] active:bg-[#3c8527]"
                onClick={() => {
                  if (version.path) clipboard.writeText(version.path)
                }}
              >
                <img src="images/icons/copy-icon.png" className="w-full h-full pixelated" alt="" />
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="content_panel h-fit max-h-full overflow-y-auto overflow-x-hidden scrollbar">
      <div className="flex flex-col gap-[24px]">
        <div className="flex flex-col w-full">
          <div className="flex flex-row w-full align-bottom">
            <div className="border-[3px] bg-[#48494a] border-[#1E1E1F] border-b-[0px] px-[8px] py-[4px] w-fit mr-[-3px]">
              <p className="minecraft-seven text-white text-[14px]">Versions</p>
            </div>
            <div className="flex flex-col grow-[1] h-fit mt-auto">
              <div className="mt-auto bg-[#1E1E1F] h-[3px] " />
              <div className="mt-auto border-x-[3px] box-content border-r-[#1E1E1F] bg-[#48494a] border-l-[#48494a] h-[7px] grow-[1]" />
            </div>
          </div>
          <div className="flex flex-col w-full gap-[3px] border-[3px] border-[#1E1E1F] bg-[#313233]">
            {versions.length > 0 ? (
              versions.map((version, index) => {
                return VersionButton(version, index, selected_version, SetSelectedVersion, RefreshVersions)
              })
            ) : (
              <div className="flex flex-col gap-[4px] flex-grow h-[58px] justify-center items-center">
                <p className="minecraft-seven text-[14px] text-white">No installed versions</p>
                <p className="minecraft-seven text-[14px] text-[#B1B2B5]">Launch a profile to install its version.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
