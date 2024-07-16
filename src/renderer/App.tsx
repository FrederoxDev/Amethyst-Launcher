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
import VersionPage from "./pages/VersionPage";
import DropWindow from "./components/DropWindow";

export default function App() {
    
    const location = useLocation();

    const highlightedIcon: CSSProperties = {borderWidth: "3px", borderColor: "#FFFFFF"};
    const unselectedIcon: CSSProperties = {borderWidth: "3px", borderColor: "#1E1E1F"}

    return (
        <AppStateProvider>
            <link rel="preload" href="images/art/lush_cave.png" as="image"/>

            <div className="container relative">
                <Title/>

                <div className="launcher_background absolute flex-group">
                    <img src="images/art/lush_cave.png" className="object-cover w-full h-full min-h-screen" alt="" />
                </div>

                <div className="contents_container absolute flex flex-row w-full gap-[12px] h-[calc(100%-64px)] p-[12px]">
                    <div className="navbar_container h-full w-[70px]">
                        <div className='h-full bg-[#313233] w-[70px] flex flex-col border-[3px] border-[#1E1E1F]'>
                            <div className="page_nav_panel grow-[1]">
                                <Link to="/" className='block p-[9px]' draggable={false}>
                                    <div className='w-[46px] h-[46px]'
                                        style={location.pathname === "/" ? highlightedIcon : unselectedIcon}>
                                        <img src="images/icons/crafting-icon.png" className='w-full h-full pixelated' alt=''/>
                                    </div>
                                </Link>
                                <Link to="/profiles" className='block p-[9px]' draggable={false}>
                                    <div className='w-[46px] h-[46px]'
                                        style={location.pathname === "/profiles" ? highlightedIcon : unselectedIcon}>
                                        <img src="images/icons/chest-icon.png" className='w-full h-full pixelated' alt=''/>
                                    </div>
                                </Link>
                                <Link to="/mods" className='block p-[9px]' draggable={false}>
                                    <div className='w-[46px] h-[46px]'
                                        style={location.pathname === "/mods" ? highlightedIcon : unselectedIcon}>
                                        <img src="images/icons/shulker-icon.png" className='w-full h-full pixelated' alt=''/>
                                    </div>
                                </Link>
                                <Link to="/versions" className='block p-[9px]' draggable={false}>
                                    <div className='w-[46px] h-[46px]'
                                         style={location.pathname === "/versions" ? highlightedIcon : unselectedIcon}>
                                        <img src="images/icons/portal-icon.png" className='w-full h-full pixelated' alt=''/>
                                    </div>
                                </Link>
                            </div>
                            
                            <Link to="/settings" className='block p-[22px] bottom-0' draggable={false}>
                                <div className='relative w-[20px] h-[20px]'>
                                    <img src="images/icons/settings-icon.png" className="absolute top-0 left-0 w-full h-full pixelated" alt=''/>
                                    {location.pathname === "/settings" ? 
                                        <img src="images/icons/settings-icon.png" className="absolute top-0 left-0 w-full h-full pixelated" alt=''/>
                                        : <></>
                                    }
                                </div>
                            </Link>
                        </div>
                    </div>
                    <div className="view_container w-[calc(100%-84px)]">
                        <Routes>
                            <Route path='/' element={<LauncherPage/>}/>
                            <Route path='/profiles' element={<ProfilePage/>}/>
                            <Route path='/profile-editor' element={<ProfileEditor/>}/>
                            <Route path='/mods' element={<ModsPage/>}/>
                            <Route path='/settings' element={<SettingsPage/>}/>
                            <Route path='/versions' element={<VersionPage/>}/>
                        </Routes>

                        <UpdatePage></UpdatePage>
                        <DropWindow></DropWindow>
                    </div>
                </div>
            </div>
        </AppStateProvider>
    )
}
