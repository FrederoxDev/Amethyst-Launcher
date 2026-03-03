import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import App from './App.tsx'
import './styles/index.css'
import { Platform } from './scripts/Platform.ts'
import { WindowsPlatform } from './scripts/windows/WindowsPlatform.ts'

export let PlatformInstance: Platform | undefined = undefined;
if (PlatformInstance === undefined) {
	switch (process.platform) {
		case 'win32':
			PlatformInstance = new WindowsPlatform();
			break;
		default:
			throw new Error(`Unsupported platform: ${process.platform}`);
	}
}

ReactDOM.createRoot(document.getElementById('app') as HTMLElement).render(
	<HashRouter>
		<App />
	</HashRouter>
)
