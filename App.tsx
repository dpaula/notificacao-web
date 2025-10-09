import React, { useState, useEffect } from 'react';
import { BellIcon } from './components/BellIcon';
import { CheckCircleIcon } from './components/CheckCircleIcon';
import { XCircleIcon } from './components/XCircleIcon';

const App: React.FC = () => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    // Check if Notification API is available
    if (!('Notification' in window)) {
      console.error('This browser does not support desktop notification');
      // You could set a state to show an "unsupported" message
      return;
    }
    // Set initial permission status
    setPermission(Notification.permission);
  }, []);

  const requestPermission = async () => {
    // Prevent multiple requests or requests when not applicable
    if (isLoading || !('Notification' in window) || Notification.permission !== 'default') {
      return;
    }

    setIsLoading(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch (error) {
      console.error('An error occurred while requesting notification permission.', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const renderContent = () => {
    switch (permission) {
      case 'granted':
        return (
          <div className="text-center">
            <CheckCircleIcon className="w-16 h-16 mx-auto text-green-400 mb-4" />
            <h1 className="text-2xl font-bold text-white">Notificações Ativadas!</h1>
            <p className="text-gray-400 mt-2">Você receberá nossas atualizações. Obrigado!</p>
          </div>
        );
      case 'denied':
        return (
          <div className="text-center">
            <XCircleIcon className="w-16 h-16 mx-auto text-red-400 mb-4" />
            <h1 className="text-2xl font-bold text-white">Notificações Bloqueadas</h1>
            <p className="text-gray-400 mt-2">
              Para receber atualizações, você precisa permitir as notificações nas configurações do seu navegador.
            </p>
          </div>
        );
      default: // 'default'
        return (
          <div className="text-center">
            <BellIcon className="w-16 h-16 mx-auto text-blue-400 mb-4" />
            <h1 className="text-2xl font-bold text-white">Receba Notificações</h1>
            <p className="text-gray-400 mt-2 mb-6">
              Clique no botão abaixo para permitir o envio de notificações e ficar por dentro das novidades.
            </p>
            <button
              onClick={requestPermission}
              disabled={isLoading}
              className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition-transform transform hover:scale-105 disabled:bg-blue-400 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isLoading ? 'Aguardando sua resposta...' : 'Ativar Notificações'}
            </button>
          </div>
        );
    }
  };

  return (
    <main className="bg-gray-900 min-h-screen flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-700">
        {renderContent()}
      </div>
       <footer className="text-center mt-8 text-gray-500 text-sm">
        <p>Criado com React & Tailwind CSS</p>
      </footer>
    </main>
  );
};

export default App;
