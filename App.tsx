import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import PushNotificationPage from './pages/PushNotificationPage';
import DematecMeliPage from './pages/DematecMeliPage';
import FaturamentosPage from './pages/FaturamentosPage';

const App: React.FC = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<PushNotificationPage />} />
      <Route path="/dematec-meli" element={<DematecMeliPage />} />
      <Route path="/faturamentos" element={<FaturamentosPage />} />
    </Routes>
  </BrowserRouter>
);

export default App;
