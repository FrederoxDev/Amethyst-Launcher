import {useEffect, useState} from "react";

const {ipcRenderer} = window.require('electron');

export default function Header() {
    const [appVersion, setAppVersion] = useState('-');

    useEffect(() => {
        ipcRenderer.invoke('get-app-version').then((version) => {
            setAppVersion(version);
        });
    }, []);

    function ToggleMaximized() { ipcRenderer.send('TITLE_BAR_ACTION', 'TOGGLE_MAXIMIZED') }
    function Minimize() { ipcRenderer.send('TITLE_BAR_ACTION', 'MINIMIZE') }
    function Close() { ipcRenderer.send('TITLE_BAR_ACTION', 'CLOSE') }

    return (
        <div className="titlebar_container">
            <div className="titlebar">
                <div className="title_panel">
                    <p className="title_text_main minecraft-ten">Amethyst Launcher</p>
                    <p className="title_text_sub minecraft-seven">{appVersion}</p>
                </div>
                <div className="window_button_panel">
                    <div className="window_button window_button_hover" tabIndex={-1} onClick={Minimize}>
                        <svg width="20" height="20" viewBox="0 0 12 12">
                            <rect className="window_button_svg" width="10" height="1" x="1" y="5.5"/>
                        </svg>
                    </div>

                    <div className="window_button window_button_hover" tabIndex={-1} onClick={ToggleMaximized}>
                        <svg width="20" height="20" viewBox="0 0 12 12">
                            <rect className="window_button_svg_box" width="10" height="10" x="1" y="1"/>
                        </svg>
                    </div>

                    <div className="window_button close_button_hover adaptive" tabIndex={-1} onClick={Close}>
                        <svg width="20" height="20" viewBox="0 0 12 12">
                            <polygon className="window_button_svg" fillRule="evenodd" points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"/>
                        </svg>
                    </div>
                </div>
            </div>

            <div className="titlebar_highlight"/>
        </div>
    )
}