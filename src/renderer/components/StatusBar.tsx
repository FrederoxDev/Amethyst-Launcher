import React from 'react'
import { UseAppState } from '../contexts/AppState'

export const StatusBar = () => {
  const { loading_percent, status, is_loading } = UseAppState()

  return (
    <div
      className={`flex shrink-0 relative border-[3px] border-[#1E1E1F] bg-[#48494A] ${status || is_loading ? '' : 'hidden'} overflow-hidden`}
    >
      {/* Loading bar */}
      <div className={`flex items-center bg-[#313233] h-[25px] transition-all duration-300 ease-in-out`}>
        <div
          className={`bg-[#3C8527] absolute ${is_loading ? 'min-h-[25px]' : 'min-h-0'} transition-all duration-300 ease-in-out`}
          style={{ width: `${loading_percent * 100}%` }}
        ></div>
        <p className="minecraft-seven absolute z-30 text-white overflow-hidden text-ellipsis whitespace-nowrap max-w-full px-2">
          {status}
        </p>
      </div>
    </div>
  )
}
