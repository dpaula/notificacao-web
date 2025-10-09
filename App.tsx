
import React, { useState, useEffect } from 'react';
import { NotificationIcon } from './components/NotificationIcon';
import { CheckCircleIcon } from './components/CheckCircleIcon';
import { XCircleIcon } from './components/XCircleIcon';
import { InfoIcon } from './components/InfoIcon';

// Read the VAPID public key from Vite's environment variables
// FIX: Add type assertion to fix "Property 'env' does not exist on type 'ImportMeta'".
// This is required as the project doesn't have a vite-env.d.ts file to declare the type for import.meta.env.
const VAPID_PUBLIC_KEY = (import.meta as { env: { VITE_VAPID_PUBLIC_KEY?: string } }).env.VITE_VAPID_PUBLIC_KEY;

// Converts the VAPID public key string to a Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const App: React.FC = () => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  useEffect(() => {
    // Check for browser support
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.error('This browser does not support push notifications.');
      return;
    }

    // Set initial permission state
    setPermission(Notification.permission);

    // Load existing subscription from localStorage
    const savedSubscription = localStorage.getItem('pushSubscription');
    if (savedSubscription) {
      setSubscription(JSON.parse(savedSubscription));
    }

    // Register the service worker
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered successfully.', reg))
      .catch(err => console.error('Service Worker registration failed:', err));
  }, []);

  const handleSubscribe = async () => {
    if (isLoading || !VAPID_PUBLIC_KEY) return;
    setIsLoading(true);

    try {
      // Request permission
      const currentPermission = await Notification.requestPermission();
      setPermission(currentPermission);

      if (currentPermission !== 'granted') {
        console.log('Permission not granted.');
        return;
      }

      // Subscribe to push notifications
      const registration = await navigator.serviceWorker.ready;
      const newSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      console.log('New subscription:', newSubscription);
      setSubscription(newSubscription);
      localStorage.setItem('pushSubscription', JSON.stringify(newSubscription));
    } catch (error) {
      console.error('Failed to subscribe the user: ', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!subscription) return;
    const subString = JSON.stringify(subscription, null, 2);
    navigator.clipboard.writeText(subString).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
    });
  };
  
  // Display a warning if the VAPID key is not configured
  if (!VAPID_PUBLIC_KEY) {
    return (
      <main className="bg-gray-900 min-h-screen flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md bg-gray-800 rounded-2xl shadow-2xl p-8 border border-red-500/50">
          <div className="text-center">
            <XCircleIcon className="w-16 h-16 mx-auto text-red-400 mb-4" />
            <h1 className="text-2xl font-bold text-white">Configuração Incompleta</h1>
            <p className="text-gray-400 mt-2">
              A chave pública VAPID não foi encontrada. Por favor, defina a variável de ambiente{' '}
              <code className="bg-gray-700 text-yellow-300 px-2 py-1 rounded-md text-sm">VITE_VAPID_PUBLIC_KEY</code>{' '}
              e reconstrua a aplicação.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const renderSubscriptionDetails = () => (
    <div className="text-center">
      <CheckCircleIcon className="w-16 h-16 mx-auto text-green-400 mb-4" />
      <h1 className="text-2xl font-bold text-white">Inscrição Ativada!</h1>
      <p className="text-gray-400 mt-2 mb-6">
        Use os dados abaixo para enviar notificações push para este dispositivo.
      </p>
      <textarea
        readOnly
        className="w-full h-48 p-3 bg-gray-900 text-gray-300 border border-gray-600 rounded-md resize-none font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
        value={JSON.stringify(subscription, null, 2)}
      />
      <button
        onClick={handleCopy}
        className="w-full mt-4 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75 transition-colors"
      >
        {isCopied ? 'Copiado para a área de transferência!' : 'Copiar Inscrição'}
      </button>
    </div>
  );

  const renderContent = () => {
    switch (permission) {
      case 'granted':
        // If permission is granted but there is no subscription yet, show the button
        return (
          <div className="text-center">
            <InfoIcon className="w-16 h-16 mx-auto text-blue-400 mb-4" />
            <h1 className="text-2xl font-bold text-white">Quase lá!</h1>
            <p className="text-gray-400 mt-2 mb-6">
              A permissão foi concedida. Clique abaixo para finalizar a inscrição e receber notificações.
            </p>
            <button
              onClick={handleSubscribe}
              disabled={isLoading}
              className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition-transform transform hover:scale-105 disabled:bg-blue-400 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Inscrevendo...' : 'Ativar Inscrição'}
            </button>
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
            <NotificationIcon className="w-16 h-16 mx-auto text-blue-400 mb-4" />
            <h1 className="text-2xl font-bold text-white">Receba Notificações</h1>
            <p className="text-gray-400 mt-2 mb-6">
              Clique no botão abaixo para permitir o envio de notificações e ficar por dentro das novidades.
            </p>
            <button
              onClick={handleSubscribe}
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
        {subscription ? renderSubscriptionDetails() : renderContent()}
      </div>
       <footer className="text-center mt-8 text-gray-500 text-sm">
        <p>Criado com React & Tailwind CSS</p>
        <p className="mt-2">
          Chave VAPID em uso: <span className="font-mono bg-gray-700 text-white px-2 py-1 rounded-md text-xs">{`${VAPID_PUBLIC_KEY.substring(0, 6)}...${VAPID_PUBLIC_KEY.substring(VAPID_PUBLIC_KEY.length - 6)}`}</span>
        </p>
      </footer>
    </main>
  );
};

export default App;