import React, { useCallback, useState } from 'react'
import MinecraftButton from '../components/MinecraftButton'
import Shard from '../scripts/types/Shard'
import { FolderPaths } from '../scripts/Paths'
import { UseAppState } from '../contexts/AppState'
import { clipboard } from 'electron'
import * as fs from 'fs'
import * as child from 'child_process'

export default function ShardManager() {
  const { mods, runtimes } = UseAppState()

  const OpenFolder = useCallback(() => {
    // Don't reveal in explorer unless there is an existing minecraft folder
    if (!fs.existsSync(FolderPaths.MinecraftUWP)) {
      alert('Minecraft is not currently installed')
      return
    }

    if (!fs.existsSync(FolderPaths.Mods)) {
      fs.mkdirSync(FolderPaths.Mods, { recursive: true })
    }

    const explorer_cmd = `explorer "${FolderPaths.Mods}"`
    child.spawn(explorer_cmd, { shell: true })
  }, [])

  const ShardButton = ({shard}: { shard: Shard.Extra }) => {
    const [open, SetOpen] = useState<boolean>(false)

    let icon_path = shard.icon_path

    if (icon_path === undefined) {
      switch (shard.manifest.meta.format) {
        default:
          icon_path = `images/icons/page-icon.png`
          break
        case Shard.Format.Mod:
          icon_path = `images/icons/page-icon.png`
          break
        case Shard.Format.Runtime:
          icon_path = `images/icons/book-icon.png`
          break
      }
    }

    return (
      <>
        <div
          className="m-[-3px] border-[3px] border-[#1E1E1F] cursor-pointer"
          onClick={() => {
            SetOpen(!open)
          }}
        >
          <div className="inset_button">
            <div className="flex flex-row justify-between items-center p-[8px]">
              <div className="flex flex-row gap-[8px]">
                <div className="w-[30px] h-[30px] border-[3px] border-[#1E1E1F] box-content">
                  <img src={icon_path} className="w-full h-full pixelated" alt="" />
                </div>
                <p className="minecraft-seven text-white text-[14px]">{shard.manifest.meta.name}</p>
                <p className="minecraft-seven text-[#B1B2B5] text-[14px]">{shard.manifest.meta.version}</p>
              </div>
              <div className="w-[30px] h-[30px] p-[10px]">
                <img
                  src={open ? `images/icons/chevron-up.png` : `images/icons/chevron-down.png`}
                  className="w-full h-full pixelated"
                  alt=""
                />
              </div>
            </div>
          </div>
        </div>
        <div
          className={`flex flex-col p-[8px] bg-[#313233] border-[3px] m-[-3px] border-[#1e1e1f] overflow-hidden ${open ? '' : 'hidden'}`}
        >
          <p className="minecraft-seven text-[#B1B2B5] text-[14px] leading-tight min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
            {typeof shard.manifest.meta.author === 'string'
              ? 'Author: ' + shard.manifest.meta.author
              : 'Authors: ' + shard.manifest.meta.author.join(', ')}
          </p>
          <p className="minecraft-seven text-[#B1B2B5] text-[14px] leading-tight min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
            {shard.manifest.meta.description ? 'Description: ' + shard.manifest.meta.description : ''}
          </p>
          <p className="minecraft-seven text-[#B1B2B5] text-[14px] leading-tight min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
            {'UUID: ' + shard.manifest.meta.uuid}
          </p>
          <p className="minecraft-seven text-[#B1B2B5] text-[14px] leading-tight min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
            {'Version: ' + shard.manifest.meta.version}
          </p>
          <div className="flex flex-row gap-[4px] justify-between">
            <p
              className="minecraft-seven text-[#B1B2B5] text-[14px] leading-tight min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
              {'Path: ' + shard.path}
            </p>
            <div className="flex flex-row gap-[4px]">
              <div
                className="w-[24px] h-[24px] shrink-0 bg-[#313233] box-content border-[3px] border-[#1E1E1F] rounded-[3px] cursor-pointer hover:border-[#48494A] hover:bg-[#5a5b5c] active:border-[#4f913c] active:bg-[#3c8527]"
                onClick={() => {
                  clipboard.writeText(shard.path)
                }}
              >
                <img src="images/icons/copy-icon.png" className="w-full h-full pixelated" alt="" />
              </div>
              <div
                className="w-[24px] h-[24px] shrink-0 bg-[#313233] box-content border-[3px] border-[#1E1E1F] rounded-[3px] cursor-pointer hover:border-[#48494A] hover:bg-[#5a5b5c] active:border-[#4f913c] active:bg-[#3c8527]"
                onClick={() => {
                  child.spawn(`explorer "${shard.path}"`, { shell: true })
                }}
              >
                <img src="images/icons/open-folder-icon.png" className="w-full h-full pixelated" alt="" />
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="flex flex-grow flex-col justify-between gap-[8px] overflow-hidden">
      <div className="content_panel h-fit max-h-full overflow-y-auto overflow-x-hidden scrollbar">
        <div className="flex flex-col gap-[24px]">
          <div className="flex flex-col w-full">
            <div className="flex flex-row w-full align-bottom">
              <div
                className="border-[3px] bg-[#48494a] border-[#1E1E1F] border-b-[0px] px-[8px] py-[4px] w-fit mr-[-3px]">
                <p className="minecraft-seven text-white text-[14px]">Runtimes</p>
              </div>
              <div className="flex flex-col grow-[1] h-fit mt-auto">
                <div className="mt-auto bg-[#1E1E1F] h-[3px] " />
                <div
                  className="mt-auto border-x-[3px] box-content border-r-[#1E1E1F] bg-[#48494a] border-l-[#48494a] h-[7px] grow-[1]" />
              </div>
            </div>
            <div className="flex flex-col w-full gap-[3px] border-[3px] border-[#1E1E1F] bg-[#313233]">
              {runtimes.length > 0 ? (
                runtimes.map((shard, index) => {
                  return <ShardButton shard={shard} key={index}/>
                })
              ) : (
                <div className="flex flex-col gap-[4px] flex-grow h-[58px] justify-center items-center">
                  <p className="minecraft-seven text-[14px] text-white">No runtimes</p>
                  <p className="minecraft-seven text-[14px] text-[#B1B2B5]">
                    Import a new runtime to use it in the launcher.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col w-full">
            <div className="flex flex-row w-full align-bottom">
              <div className="border-[3px] border-[#1E1E1F] border-b-[0px] px-[8px] py-[4px] w-fit mr-[-3px]">
                <p className="minecraft-seven text-white text-[14px]">Mods</p>
              </div>
              <div className="flex flex-col grow-[1] h-fit mt-auto">
                <div className="mt-auto bg-[#1E1E1F] h-[3px] " />
                <div className="mt-auto border-x-[3px] box-content border-r-[#1E1E1F] border-l-[#48494a] h-[7px] grow-[1]" />
              </div>
            </div>

            <div className="flex flex-col w-full gap-[3px] border-[3px] border-[#1E1E1F] bg-[#313233]">
              {mods.length > 0 ? (
                mods.map((shard, index) => {
                  return <ShardButton shard={shard} key={index}/>
                })
              ) : (
                <div className="flex flex-col gap-[4px] flex-grow h-[58px] justify-center items-center">
                  <p className="minecraft-seven text-[14px] text-white">No mods</p>
                  <p className="minecraft-seven text-[14px] text-[#B1B2B5]">
                    Import a new mod to use it in the launcher.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="content_panel h-fit">
        <div className="w-full h-fit">
          <MinecraftButton text="Open folder" onClick={OpenFolder} />
        </div>
      </div>
    </div>
  )
}
