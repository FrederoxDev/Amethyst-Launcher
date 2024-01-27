import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Title from './components/Title';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <div className='h-screen overflow-hidden'>
      <Title />

      {/* Side Panel */}
      <div className='fixed left-0 top-[48px] h-full bg-[#313233] w-[80px] p-4 flex border-r-[2px] border-r-[#1E1E1F]'>
        e
      </div>

      {/* Main View */}
      <div className='fixed top-[48px] left-[80px] w-full h-full'>
        <BrowserRouter>
          <Routes>
            <Route path='/' element={<App />} />
          </Routes>
        </BrowserRouter>
      </div>

    </div>
  </React.StrictMode>
);
