import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import Title from './components/Title';
import MainPage from './pages/MainPage';
import ProfilePage from './pages/ProfilePage';
import ProfileEditor from './pages/ProfileEditor';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <BrowserRouter basename='/'>
      <div className='h-screen overflow-hidden'>
        <Title />

        {/* Side Panel */}
        <div className='fixed left-0 top-[48px] h-full bg-[#313233] w-[80px] flex flex-col border-r-[2px] border-r-[#1E1E1F]'>
          {/* <Link to="/" className='block p-[8px]'>
            <div className='bg-red-700 w-[64px] h-[64px] box-border border-[#1E1E1F] border-[2px]'>Home</div>
          </Link> */}
          <Link to="/" className='block p-[8px]'>
            <div className='bg-red-700 w-[64px] h-[64px] box-border border-[#1E1E1F] border-[2px]'>Profiles</div>
          </Link>
        </div>

        {/* Main View */}
        <div className='fixed top-[48px] left-[80px] right-0 bottom-0'>
            <Routes>
              {/* <Route path='/' element={<App />} /> */}
              <Route path='/' element={ <ProfilePage /> } />
              <Route path='/profile-editor' element={ <ProfileEditor /> } />
            </Routes>
        </div>
      </div>
    </BrowserRouter>
  </React.StrictMode>
);
