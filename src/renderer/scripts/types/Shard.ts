import * as Shard from './Shard/Shard.Exports'
import { FolderPaths } from '../Paths'
import * as fs from 'node:fs'
import path from 'path'
import { Console } from './Console'

export default Shard
export { Shard }

export function GetShards(): Shard.Full[] {
  const shards: Shard.Full[] = []

  if (fs.existsSync(FolderPaths.Mods)) {
    const mod_directories = fs.readdirSync(FolderPaths.Mods, { withFileTypes: true }).filter(entry => entry.isDirectory())
    for (const mod_directory of mod_directories) {
      const dir_path = path.join(mod_directory.parentPath, mod_directory.name)

      const config_path = path.join(dir_path, 'mod.json')
      if (fs.existsSync(config_path)) {
        const text = fs.readFileSync(config_path, 'utf-8')
        const json = JSON.parse(text)

        if (Shard.Full.Validator(json)) {
          shards.push(json)
        }
        else {
          Console.Group(Console.ErrorStr(`Failed to parse \`manifest.json\` in ${mod_directory.name}`), () => {
            console.log(Shard.Full.Validator.errors)
          })
        }
      }
    }
  }

  return shards
}

export function FindShard(shard: Shard.Fragment): Shard.Full | undefined {
  const shards = GetShards()

  return shards.filter(s => s.meta.uuid === shard.uuid).find(s => s.meta.version === shard.version)
}
