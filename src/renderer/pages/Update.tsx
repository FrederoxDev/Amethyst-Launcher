import { useCallback, useEffect, useState } from 'react'
import MinecraftButton from '../components/MinecraftButton'
import { MinecraftButtonStyle } from '../components/MinecraftButtonStyle'
import { UpdateInfo } from 'electron-updater'
import LoadingWheel from '../components/LoadingWheel'
import PopupPanel from '../components/PopupPanel'
import { ipcRenderer } from 'electron'

export default function Update() {
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [popupClosed, setPopupClosed] = useState<boolean>(false)
  const [downloadActive, setDownloadActive] = useState<boolean>(false)
  const [downloadPercentage, setDownloadPercentage] = useState<number>(0)

  const [appVersion, setAppVersion] = useState('-')

  const checkForUpdates = useCallback(() => {
    ipcRenderer.invoke('check-for-updates')
  }, [])

  const downloadUpdate = useCallback(() => {
    ipcRenderer.invoke('update-download').then(lls => {
      console.log('Download download:', lls)
    })
    setDownloadActive(true)
    ipcRenderer.invoke('set-auto-install-on-app-quit', true)
  }, [setDownloadActive])

  const ignoreUpdate = useCallback(() => {
    setPopupClosed(true)
    ipcRenderer.invoke('set-auto-install-on-app-quit', false)
  }, [setPopupClosed])

  useEffect(() => {
    ipcRenderer.invoke('set-auto-download', false)
    ipcRenderer.invoke('set-auto-install-on-app-quit', true)
    checkForUpdates()

    ipcRenderer.on('update-available', (event, info) => {
      console.log('Update available:', info)
      setUpdateInfo(info)
      setUpdateAvailable(true)
      setPopupClosed(false)
    })

    ipcRenderer.on('update-cancelled', (event, info) => {
      console.log('Download cancelled:', info)
      throw new Error(`Launcher Update cancelled`)
    })

    ipcRenderer.on('download-progress', (event, info) => {
      console.log('Download progress:', info)
      setDownloadPercentage(info.percent)
    })

    ipcRenderer.on('update-downloaded', (event, info) => {
      console.log('Update downloaded:', info)
      console.log('restart now?')

      setDownloadPercentage(100)
      setUpdateAvailable(false)
      setPopupClosed(true)
      setDownloadActive(false)
    })
  }, [setUpdateAvailable, setPopupClosed, setDownloadActive, setDownloadPercentage, checkForUpdates])

  useEffect(() => {
    ipcRenderer.invoke('get-app-version').then(version => {
      setAppVersion(version)
    })
  }, [])

  return (
    <>
      {!popupClosed && updateAvailable && (
        <PopupPanel>
          {!downloadActive && (
            <div className="w-[500px]">
              <div className="w-full border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                <p className="minecraft-seven text-white text-[14px]">Launcher Update found!</p>
              </div>
              <div className="w-full border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                <p className="minecraft-seven text-[#BCBEC0] text-[12px]">
                  Version: {updateInfo ? updateInfo.version : 'undefined'} (current: {appVersion})
                </p>
                <p className="minecraft-seven text-[#BCBEC0] text-[12px]">
                  Path: {updateInfo ? updateInfo.path : 'undefined'}
                </p>
                <p className="minecraft-seven text-[#BCBEC0] text-[12px]">
                  Release Date: {updateInfo ? updateInfo.releaseDate : 'undefined'}
                </p>
                <p className="minecraft-seven text-[#BCBEC0] text-[12px]">
                  Sha512: {updateInfo ? updateInfo.sha512 : 'undefined'}
                </p>
              </div>
              <div className="flex justify-around gap-[8px] w-full border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                <MinecraftButton text="Download" style={MinecraftButtonStyle.Confirm} onClick={downloadUpdate} />
                <MinecraftButton text="Ignore" style={MinecraftButtonStyle.Warn} onClick={ignoreUpdate} />
              </div>
            </div>
          )}
          {downloadActive && (
            <LoadingWheel text={'Downloading update...'} percentage={downloadPercentage}></LoadingWheel>
          )}
        </PopupPanel>
      )}
    </>
  )
}
