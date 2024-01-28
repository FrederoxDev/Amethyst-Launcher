import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import Title from './components/Title';
import MainPage from './pages/MainPage';
import ProfilePage from './pages/ProfilePage';
import ProfileEditor from './pages/ProfileEditor';
import { AppStateProvider } from './contexts/AppState';
import LauncherPage from './pages/LauncherPage';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// const location = useLocation();

root.render(
  <React.StrictMode>
    <BrowserRouter basename='/'>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
