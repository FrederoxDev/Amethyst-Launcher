import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import App from './App.tsx'
import './styles/index.css'

import { ipcRenderer } from 'electron'
import path from 'path'
import { FolderPaths } from './scripts/Paths'
import { Extractor } from './scripts/backend/Extractor'

ipcRenderer.on('import-shard', (_event, args) => {
  function ImportShard(shard_path: string) {
    try {
      const shard_name = path.basename(shard_path)
      const extracted_folder_path = path.join(FolderPaths.Mods, shard_name.slice(0, -'.shard'.length))
      console.log(extracted_folder_path)
      Extractor.extractFile(shard_path, extracted_folder_path, [], undefined, success => {
        if (!success) {
          throw new Error('There was an error while extracting shard!')
        }

        console.log('Successfully extracted shard!')
      }).then()
    } catch (error) {
      console.error(error)
    }
  }

  console.log(args)
  ImportShard(args)
})

ipcRenderer.invoke('get-process-argv').then((args) => {
  function ImportShard(shard_path: string) {
    try {
      const zip_name = path.basename(shard_path)
      const extracted_folder_path = path.join(FolderPaths.Mods, zip_name.slice(0, -'.shard'.length))
      console.log(extracted_folder_path)
      Extractor.extractFile(shard_path, extracted_folder_path, [], undefined, success => {
        if (!success) {
          throw new Error('There was an error while extracting shard!')
        }

        console.log('Successfully extracted shard!')
      }).then()
    } catch (error) {
      console.error(error)
    }
  }

  if (args[1] !== undefined && args[1] !== '.') {
    console.log(args[1])
    ImportShard(args[1])
  }
})

ReactDOM.createRoot(document.getElementById('app') as HTMLElement).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
)
