import { CSSProperties } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import Title from './components/Title'
import { AppStateProvider } from './contexts/AppState'
import Launcher from './pages/Launcher'
import ProfileEditor from './pages/ProfileEditor'
import Settings from './pages/Settings'
import Update from './pages/Update'
import VersionManager from './pages/VersionManager'
import DropWindow from './components/DropWindow'
import ShardManager from './pages/ShardManager'
import ProfileManager from './pages/ProfileManager'
import { StatusBar } from './components/StatusBar'

export default function App() {
  const location = useLocation()

  const highlightedIcon: CSSProperties = { borderWidth: '3px', borderColor: '#FFFFFF' }
  const unselectedIcon: CSSProperties = { borderWidth: '3px', borderColor: '#1E1E1F' }

  return (
    <AppStateProvider>
      <link rel="preload" href="images/art/lush_cave.png" as="image" />

      <div className="container relative">
        <Title />

        <div className="launcher_background absolute flex-group">
          <img src="images/art/lush_cave.png" className="object-cover w-full h-full min-h-screen" alt="" />
        </div>

        <div className="contents_container absolute flex flex-row w-full gap-[12px] h-[calc(100%-64px)] p-[12px]">
          <div className="navbar_container h-full w-[68px]">
            <div className="h-full bg-[#313233] w-[68px] flex flex-col justify-between items-center p-[8px] border-[3px] border-[#1E1E1F]">
              <div className="flex flex-col gap-[16px] grow-[1]">
                <Link to="/" draggable={false}>
                  <div
                    className="w-[46px] h-[46px]"
                    style={location.pathname === '/' ? highlightedIcon : unselectedIcon}
                  >
                    <img src="images/icons/crafting-icon.png" className="w-full h-full pixelated" alt="" />
                  </div>
                </Link>
                <Link to="/profile-manager" draggable={false}>
                  <div
                    className="w-[46px] h-[46px]"
                    style={location.pathname === '/profile-manager' ? highlightedIcon : unselectedIcon}
                  >
                    <img src="images/icons/chest-icon.png" className="w-full h-full pixelated" alt="" />
                  </div>
                </Link>
                <Link to="/shard-manager" draggable={false}>
                  <div
                    className="w-[46px] h-[46px]"
                    style={location.pathname === '/shard-manager' ? highlightedIcon : unselectedIcon}
                  >
                    <img src="images/icons/shulker-icon.png" className="w-full h-full pixelated" alt="" />
                  </div>
                </Link>
                <Link to="/versions" draggable={false}>
                  <div
                    className="w-[46px] h-[46px]"
                    style={location.pathname === '/versions' ? highlightedIcon : unselectedIcon}
                  >
                    <img src="images/icons/portal-icon.png" className="w-full h-full pixelated" alt="" />
                  </div>
                </Link>
              </div>

              <Link to="/settings" draggable={false}>
                <div className="flex justify-center items-center w-[46px] h-[46px]">
                  <img src="images/icons/settings-icon.png" className="w-[20px] h-[20px] pixelated" alt="" />
                </div>
              </Link>
            </div>
          </div>
          <div className="view_container flex flex-col gap-[8px] h-full w-[calc(100%-80px)]">
            <StatusBar/>
            <Routes>
              <Route path="/" element={<Launcher />} />
              <Route path="/profile-manager" element={<ProfileManager />} />
              <Route path="/profile-editor" element={<ProfileEditor />} />
              <Route path="/shard-manager" element={<ShardManager />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/versions" element={<VersionManager />} />
            </Routes>
          </div>
        </div>
      </div>
      <Update></Update>
      <DropWindow></DropWindow>
    </AppStateProvider>
  )
}
