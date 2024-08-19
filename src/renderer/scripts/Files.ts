import * as fs from 'fs'
import * as path from 'path'

export function CopyRecursive(source_path: string, target_path: string): void {
  if (fs.existsSync(source_path)) {
    if (fs.lstatSync(source_path).isDirectory()) {
      const copy_path: string = path.join(target_path, path.basename(source_path))
      if (!fs.existsSync(copy_path)) {
        fs.mkdirSync(copy_path, { recursive: true })
      }

      fs.readdirSync(source_path).forEach((child_path: string) => {
        CopyRecursive(path.join(source_path, child_path), path.join(copy_path, child_path))
      })
    } else {
      fs.copyFileSync(source_path, target_path)
    }
  } else {
    throw new Error(`start_path: '${source_path}' does not exist!`)
  }
}
