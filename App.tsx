import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import PushNotificationPage from './pages/PushNotificationPage';
import DematecMeliPage from './pages/DematecMeliPage';

const App: React.FC = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<PushNotificationPage />} />
      <Route path="/dematec-meli" element={<DematecMeliPage />} />
    </Routes>
  </BrowserRouter>
);

export default App;
