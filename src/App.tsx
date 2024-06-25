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

export default function App() {
    
    const location = useLocation();

    const highlightedIcon: CSSProperties = {borderWidth: "2px", borderColor: "#FFFFFF"};
    const unselectedIcon: CSSProperties = {borderWidth: "2px", borderColor: "#1E1E1F"}

    return (

        <AppStateProvider>
            <link rel="preload" href="images/launcher_hero.png" as="image"></link>
            <link rel="preload" href="logo192.png" as="image"></link>
            <div className='h-screen overflow-hidden bg-[#313233]'>
                
                {/* Side Panel */}

                <div className="fixed left-0 top-[64px] bottom-[0px]">
                    <div
                        className='h-full bg-[#313233] w-[66px] flex flex-col border-r-[2px] border-r-[#1E1E1F]'>

                        <Link to="/" className='block p-[8px]' draggable={false}>
                            <div className='w-[48px] h-[48px]'
                                style={location.pathname === "/" ? highlightedIcon : unselectedIcon}>
                                <img src="images/general_icon.png" className='w-full h-full pixelated' alt=''/>
                            </div>
                        </Link>

                        <Link to="/profiles" className='block p-[8px]' draggable={false}>
                            <div className='w-[48px] h-[48px]'
                                style={location.pathname === "/profiles" ? highlightedIcon : unselectedIcon}>
                                <img src="images/advanced_icon.png" className='w-full h-full pixelated' alt=''/>
                            </div>
                        </Link>

                        <Link to="/mods" className='block p-[8px]' draggable={false}>
                            <div className='w-[48px] h-[48px]'
                                style={location.pathname === "/mods" ? highlightedIcon : unselectedIcon}>
                                <img src="images/mods_icon.png" className='w-full h-full pixelated' alt=''/>
                            </div>
                        </Link>
                        <Link to="/settings" className='block p-[12px] mt-auto bottom-0' draggable={false}>
                            <div className='relative w-[40px] h-[40px]'>
                                <img src="images/settings_icon.png" className="absolute top-0 left-0 w-full h-full pixelated" alt=''/>
                                {location.pathname === "/settings" ? 
                                    <img src="images/settings_icon_unselected.png" className="absolute top-0 left-0 w-full h-full pixelated" alt=''/> 
                                    : <></>
                                }
                            </div>
                        </Link>

                    </div>
                </div>
                
                

                {/* Main View */}

                <Title/>

                <Routes>
                    <Route path='/' element={<LauncherPage/>}/>
                    <Route path='/profiles' element={<ProfilePage/>}/>
                    <Route path='/profile-editor' element={<ProfileEditor/>}/>
                    <Route path='/mods' element={<ModsPage/>}/>
                    <Route path='/settings' element={<SettingsPage/>}/>
                </Routes>

                {/*Update Page*/}
                <UpdatePage></UpdatePage>

            </div>
        </AppStateProvider>
    )
}
