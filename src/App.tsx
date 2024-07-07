import {CSSProperties} from "react";
import {Link, Route, Routes, useLocation} from "react-router-dom";
import Title from "./components/Title";
import {AppStateProvider} from "./contexts/AppState";
import LauncherPage from "./pages/LauncherPage";
import ProfileEditor from "./pages/ProfileEditor";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import UpdatePage from "./pages/UpdatePage";
import ModsPage from "./pages/ModsPage";
import DropWindow from "./components/DropWindow";

export default function App() {
    
    const location = useLocation();

    const highlightedIcon: CSSProperties = {borderWidth: "2px", borderColor: "#FFFFFF"};
    const unselectedIcon: CSSProperties = {borderWidth: "2px", borderColor: "#1E1E1F"}

    return (
        <AppStateProvider>
            <link rel="preload" href="images/art/lush_cave.png" as="image"/>

            <div className='h-screen overflow-hidden bg-[#313233]'>

                <Title/>
                
                {/* Side Panel */}
                <div className="fixed left-0 top-[62px] bottom-[0px]">
                    <div className='h-full bg-[#313233] w-[66px] flex flex-col border-r-[2px] border-r-[#1E1E1F]'>
                        <Link to="/" className='block p-[8px]' draggable={false}>
                            <div className='w-[48px] h-[48px]'
                                style={location.pathname === "/" ? highlightedIcon : unselectedIcon}>
                                <img src="images/icons/crafting-icon.png" className='w-full h-full pixelated' alt=''/>
                            </div>
                        </Link>
                        <Link to="/profiles" className='block p-[8px]' draggable={false}>
                            <div className='w-[48px] h-[48px]'
                                style={location.pathname === "/profiles" ? highlightedIcon : unselectedIcon}>
                                <img src="images/icons/chest-icon.png" className='w-full h-full pixelated' alt=''/>
                            </div>
                        </Link>
                        <Link to="/mods" className='block p-[8px]' draggable={false}>
                            <div className='w-[48px] h-[48px]'
                                style={location.pathname === "/mods" ? highlightedIcon : unselectedIcon}>
                                <img src="images/icons/shulker-icon.png" className='w-full h-full pixelated' alt=''/>
                            </div>
                        </Link>
                        <Link to="/settings" className='block p-[18px] mt-auto bottom-0' draggable={false}>
                            <div className='relative w-[24px] h-[24px]'>
                                <img src="images/icons/settings-icon.png" className="absolute top-0 left-0 w-full h-full pixelated" alt=''/>
                                {location.pathname === "/settings" ? 
                                    <img src="images/icons/settings-icon.png" className="absolute top-0 left-0 w-full h-full pixelated" alt=''/> 
                                    : <></>
                                }
                            </div>
                        </Link>
                    </div>
                </div>
                
                <Routes>
                    <Route path='/' element={<LauncherPage/>}/>
                    <Route path='/profiles' element={<ProfilePage/>}/>
                    <Route path='/profile-editor' element={<ProfileEditor/>}/>
                    <Route path='/mods' element={<ModsPage/>}/>
                    <Route path='/settings' element={<SettingsPage/>}/>
                </Routes>

                <UpdatePage></UpdatePage>
            </div>

            <DropWindow />
        </AppStateProvider>
    )
}
