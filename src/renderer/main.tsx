import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

import { HashRouter } from 'react-router-dom'

import './styles/index.css'

ReactDOM.createRoot(document.getElementById('app') as HTMLElement).render(
  <HashRouter>
    <App/>
  </HashRouter>
)
