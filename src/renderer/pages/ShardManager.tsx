import { useEffect, useState } from 'react'
import Panel from '../components/Panel'
import MinecraftButton from '../components/MinecraftButton'
import { FolderPaths } from '../scripts/Paths'

import { Shard, GetShards } from '../scripts/types/Shard'

import PopupPanel from '../components/PopupPanel'

import * as fs from 'fs'
import * as child from 'child_process'
import List from '../components/List'
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
  const [shard_index, SetShardIndex] = useState<number | undefined>(undefined)

  // const [mods, SetMods] = useState<Shard.Full[]>([])
  // const [mod_index, SetModIndex] = useState<number | undefined>(undefined)
  //
  // const [runtimes, SetRuntimes] = useState<Shard.Full[]>([])
  // const [runtime_index, SetRuntimeIndex] = useState<number | undefined>(undefined)

  useEffect(() => {
    SetShards(GetShards())
  }, [])

  return (
    <>
      <Panel>
        <div className="content_panel">
          <p className="minecraft-seven text-white text-[14px]">Mod Manager</p>
          <List>
            {
              shards.map((shard, index) => (
                <ListItem className="cursor-pointer" onClick={() => SetShardIndex(index)} key={index}>
                  <div className="p-[8px]">
                    <p className="minecraft-seven text-white text-[14px] px-[4px]">{shard.meta.name}</p>
                    <p className="minecraft-seven text-[#B1B2B5] text-[14px] px-[4px]">{shard.meta.description ?? ''}</p>
                  </div>
                </ListItem>
              ))
            }
          </List>
          <div className="w-full h-fit">
            <MinecraftButton text="Open Mods Folder" onClick={OpenShardsFolder} />
          </div>
        </div>
      </Panel>

      { shard_index && (
        <PopupPanel onExit={() => SetShardIndex(undefined)}>
          <div className="w-[500px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
            <div className="flex">
              <p className="minecraft-seven text-white text-[14px] max-w-[400px]">{shards[shard_index].meta.name}</p>
              <div
                className="p-[4px] justify-center items-center ml-auto cursor-pointer"
                onClick={() => SetShardIndex(undefined)}
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
              {shards[shard_index].meta.description ?? ''}
            </p>
          </div>
        </PopupPanel>
      )}
    </>
  )
}
