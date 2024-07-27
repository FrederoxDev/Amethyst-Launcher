import { useEffect, useState } from 'react'
import MinecraftButton from '../components/MinecraftButton'
import { FolderPaths } from '../scripts/Paths'

import { GetShards, Shard } from '../scripts/types/Shard'

// import PopupPanel from '../components/PopupPanel'
import * as fs from 'fs'
import * as child from 'child_process'
import ListItem from '../components/ListItem'

const OpenShardsFolder = () => {
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
}

export default function ShardManager() {

  const [shards, SetShards] = useState<Shard.Full[]>([])

  const [mods, SetMods] = useState<Shard.Full[]>([])
  const [mod_index, SetModIndex] = useState<number | undefined>(undefined)

  const [runtimes, SetRuntimes] = useState<Shard.Full[]>([])
  const [runtimes_index, SetRuntimeIndex] = useState<number | undefined>(undefined)

  useEffect(() => {
    SetShards(GetShards())
  }, [])

  useEffect(() => {
    const temp_mods: Shard.Full[] = []
    const temp_runtimes: Shard.Full[] = []

    shards.map(shard => {
      switch (shard.meta.format) {
        default:
          temp_mods.push(shard)
          break
        case 0:
          temp_mods.push(shard)
          break
        case 1:
          temp_runtimes.push(shard)
          break
      }
    })

    SetMods(temp_mods)
    SetRuntimes(temp_runtimes)
  }, [shards])

  const ShardButton = (shard: Shard.Full, index: number, selected_index: number | undefined, SetSelectedIndex: (index: number | undefined) => void) => {
    return (
      <div key={index}>
        <ListItem className="cursor-pointer" onClick={() => {
          (selected_index === index) ? SetSelectedIndex(undefined) : SetSelectedIndex(index)
        }}>
          <div className="p-[8px]">
            <div className="flex flex-row">
              <p className="minecraft-seven text-white text-[14px] px-[4px]">{shard.meta.name}</p>
              <p
                className="minecraft-seven text-[#B1B2B5] text-[14px] px-[4px]">{shard.meta.version}</p>
            </div>
          </div>
        </ListItem>
        <div
          className={`border-[3px] m-[-3px] border-[#1e1e1f] ${(selected_index === index) ? '' : 'hidden'} transition-[max-height] duration-[0.5] ease-in-out`}>
          <div className="w-full h-fit p-[8px] bg-[#313233] border-[0px] border-[#333334]">
            <p className="minecraft-seven text-white text-[14px] px-[4px]">
              {(typeof shard.meta.author === 'string') ? 'Author: ' + shard.meta.author : 'Authors: ' + shard.meta.author.join(', ')}
            </p>
            <p className="minecraft-seven text-[#B1B2B5] text-[14px] px-[4px]">
              {(shard.meta.description) ? 'Description: ' + shard.meta.description : ''}
            </p>
            <p className="minecraft-seven text-[#B1B2B5] text-[14px] px-[4px]">
              {'UUID: ' + shard.meta.uuid}
            </p>
            <p className="minecraft-seven text-[#B1B2B5] text-[14px] px-[4px]">
              {'Version: ' + shard.meta.version}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="w-full h-full flex flex-col gap-[8px]">
        <div className="content_panel h-fit max-h-full overflow-y-auto scrollbar">
          <div className="flex flex-col gap-[24px]">
            <div className="flex flex-col w-full">
              <div className="flex flex-row w-full align-bottom">
                <div
                  className="border-[3px] bg-[#48494a] border-[#1E1E1F] border-b-[0px] px-[8px] py-[4px] w-fit mr-[-3px]">
                  <p className="minecraft-seven text-white text-[14px]">Runtimes</p>
                </div>
                <div className="flex flex-col grow-[1] h-fit mt-auto">
                  <div
                    className="mt-auto bg-[#1E1E1F] h-[3px] " />
                  <div
                    className="mt-auto border-x-[3px] box-content border-r-[#1E1E1F] bg-[#48494a] border-l-[#48494a] h-[7px] grow-[1]" />
                </div>
              </div>
              <div className="flex flex-col w-full gap-[3px] border-[3px] border-[#1E1E1F] bg-[#313233]">
                {
                  runtimes.map((shard, index) => {
                    return ShardButton(shard, index, runtimes_index, SetRuntimeIndex)
                  })
                }
              </div>
            </div>

            <div className="flex flex-col w-full">
              <div className="flex flex-row w-full align-bottom">
                <div className="border-[3px] border-[#1E1E1F] border-b-[0px] px-[8px] py-[4px] w-fit mr-[-3px]">
                  <p className="minecraft-seven text-white text-[14px]">Mods</p>
                </div>
                <div className="flex flex-col grow-[1] h-fit mt-auto">
                  <div
                    className="mt-auto bg-[#1E1E1F] h-[3px] " />
                  <div
                    className="mt-auto border-x-[3px] box-content border-r-[#1E1E1F] border-l-[#48494a] h-[7px] grow-[1]" />
                </div>
              </div>

              <div className="flex flex-col w-full gap-[3px] border-[3px] border-[#1E1E1F] bg-[#313233]">
                {
                  mods.map((shard, index) => {
                    return ShardButton(shard, index, mod_index, SetModIndex)
                  })
                }
              </div>
            </div>
          </div>
          {/*<div className="mt-auto w-full h-fit">*/}
          {/*  <MinecraftButton text="Open Mods Folder" onClick={OpenShardsFolder} />*/}
          {/*</div>*/}
        </div>
        <div className="content_panel h-fit mt-auto">
          <div className="w-full h-fit">
            <MinecraftButton text="Open Mods Folder" onClick={OpenShardsFolder} />
          </div>
        </div>
      </div>

      {/*{shard_index !== undefined && (*/}
      {/*  <PopupPanel onExit={() => SetShardIndex(undefined)}>*/}
      {/*    <div className="w-[500px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">*/}
      {/*      <div className="flex">*/}
      {/*        <p className="minecraft-seven text-white text-[14px] max-w-[400px]">{shards[shard_index].meta.name}</p>*/}
      {/*        <div*/}
      {/*          className="p-[4px] justify-center items-center ml-auto cursor-pointer"*/}
      {/*          onClick={() => SetShardIndex(undefined)}*/}
      {/*        >*/}
      {/*          <svg width="12" height="12" viewBox="0 0 12 12">*/}
      {/*            <polygon*/}
      {/*              className="fill-[#FFFFFF]"*/}
      {/*              fillRule="evenodd"*/}
      {/*              points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"*/}
      {/*            />*/}
      {/*          </svg>*/}
      {/*        </div>*/}
      {/*      </div>*/}

      {/*      <p className="minecraft-seven text-[#BCBEC0] text-[12px] max-w-[400px]">*/}
      {/*        { shards[shard_index].meta.description ?? '' }*/}
      {/*      </p>*/}
      {/*      <p className="minecraft-seven text-[#BCBEC0] text-[12px] max-w-[400px]">*/}
      {/*        { shards[shard_index].meta.uuid }*/}
      {/*      </p>*/}
      {/*      <p className="minecraft-seven text-[#BCBEC0] text-[12px] max-w-[400px]">*/}
      {/*        { shards[shard_index].meta.author }*/}
      {/*      </p>*/}
      {/*      <p className="minecraft-seven text-[#BCBEC0] text-[14px] max-w-[400px]">*/}
      {/*        { (shards[shard_index].meta.format === undefined || 0) ? 'Mod' : (shards[shard_index].meta.format === 1) ? 'Runtime' : '' }*/}
      {/*      </p>*/}
      {/*    </div>*/}
      {/*  </PopupPanel>*/}
      {/*)}*/}
    </>
  )
}
