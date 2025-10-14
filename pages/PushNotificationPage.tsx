import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { BellIcon } from '../components/BellIcon';
import { CheckCircleIcon } from '../components/CheckCircleIcon';
import { XCircleIcon } from '../components/XCircleIcon';
import { InfoIcon } from '../components/InfoIcon';

// Converts a base64 VAPID key into a Uint8Array required by PushManager.
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const PushNotificationPage: React.FC = () => {
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyMismatchError, setKeyMismatchError] = useState<boolean>(false);

  const frontendVapidKey = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY;

  const checkVapidKeyMatch = useCallback(async () => {
    if (!frontendVapidKey) {
        setError("Frontend VAPID public key is not defined.");
        return;
    }
    try {
        const response = await fetch('/api/vapid-key');
        if (!response.ok) {
            throw new Error('Failed to fetch key from server.');
        }
        const { publicKey: backendVapidKey } = await response.json();
        
        if (frontendVapidKey !== backendVapidKey) {
            setKeyMismatchError(true);
            setError("Configuration Error: Frontend and Backend VAPID keys do not match. Please clear site data and ensure the app is redeployed correctly.");
        } else {
            console.log("VAPID keys match between frontend and backend.");
        }
    } catch (e) {
        console.error("Could not verify VAPID key with backend:", e);
        setError("Could not verify configuration with the server. Please check the connection.");
    }
  }, [frontendVapidKey]);
  
  useEffect(() => {
    checkVapidKeyMatch();

    const registerServiceWorker = () => {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const swUrl = `${window.location.origin}/sw.js`;
        navigator.serviceWorker.register(swUrl)
          .then(registration => {
            console.log('Service Worker registered with scope:', registration.scope);
            setNotificationPermission(Notification.permission);
            return registration.pushManager.getSubscription();
          })
          .then(sub => {
            if (sub) {
              console.log('User IS subscribed.');
              setIsSubscribed(true);
              setSubscription(sub);
            } else {
              console.log('User is NOT subscribed.');
              setIsSubscribed(false);
            }
          })
          .catch(err => {
            console.error('Service Worker registration failed:', err);
            setError('Service Worker registration failed.');
          });
      } else {
        setError('Push messaging is not supported.');
        setNotificationPermission('denied');
      }
    };

    if (document.readyState === 'complete') {
      registerServiceWorker();
    } else {
      window.addEventListener('load', registerServiceWorker);
      return () => window.removeEventListener('load', registerServiceWorker);
    }
  }, [checkVapidKeyMatch]);

  const handleRequestPermission = async () => {
    if (keyMismatchError) return;
    if (!('Notification' in window)) {
      setError('This browser does not support desktop notification');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        subscribeUser();
      }
    } catch (err) {
      console.error('Error requesting notification permission:', err);
      setError('Failed to request notification permission.');
    }
  };

  const subscribeUser = async () => {
    if (!frontendVapidKey) {
      setError('VAPID public key is not defined. Please check your environment variables.');
      return;
    }
    const applicationServerKey = urlBase64ToUint8Array(frontendVapidKey);

    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      console.log('User is subscribed:', sub);
      setIsSubscribed(true);
      setSubscription(sub);
      
      await fetch('/api/push/register', {
        method: 'POST',
        body: JSON.stringify(sub),
        headers: {
          'Content-Type': 'application/json',
        },
      });

    } catch (err) {
      console.error('Failed to subscribe the user: ', err);
      setError('Failed to subscribe for notifications.');
      if (notificationPermission === 'granted') {
        setNotificationPermission('default');
      }
    }
  };
  
  const handleReset = async () => {
    try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
            await sub.unsubscribe();
            console.log('User unsubscribed.');
        }
        await fetch('/api/push/last-subscription', { method: 'DELETE' });
        console.log('Subscription cleared from backend.');
        
        setIsSubscribed(false);
        setSubscription(null);
        setNotificationPermission('default');
        setError(null);
        
        await checkVapidKeyMatch();

    } catch (err) {
        console.error('Error during reset:', err);
        setError('Failed to reset subscription. Please clear site data manually.');
    }
  };

  const handleTestNotification = () => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_TEST_NOTIFICATION',
      });
    } else {
      setError('Service worker not in control. Please reload the page.');
    }
  };

  const renderStatus = () => {
    if (error) {
      return (
        <div className="flex items-center text-red-500">
          <XCircleIcon className="w-6 h-6 mr-2" />
          <span>{error}</span>
        </div>
      );
    }
    switch (notificationPermission) {
      case 'granted':
        return (
          <div className="flex items-center text-green-500">
            <CheckCircleIcon className="w-6 h-6 mr-2" />
            <span>Notifications are enabled.</span>
          </div>
        );
      case 'denied':
        return (
          <div className="flex items-center text-red-500">
            <XCircleIcon className="w-6 h-6 mr-2" />
            <span>Notifications are blocked. Please enable them in your browser settings.</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center text-gray-500">
            <InfoIcon className="w-6 h-6 mr-2" />
            <span>Please enable notifications to receive updates.</span>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans">
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto flex flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Notificações Push</h1>
            <p className="text-sm text-gray-500">
              Configure permissões e teste o envio de notificações web.
            </p>
          </div>
          <Link
            to="/dematec-meli"
            className="inline-flex items-center justify-center rounded-full border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-600 transition hover:border-indigo-400 hover:bg-indigo-50"
          >
            Abrir Chat Dematec · Meli
          </Link>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <div className="flex items-center mb-6">
            <BellIcon className="w-10 h-10 text-indigo-500 mr-4" />
            <h2 className="text-3xl font-bold text-gray-800">Push Notifications</h2>
          </div>
          
          {keyMismatchError ? (
              <div className="p-4 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-lg">
                <h3 className="font-bold text-lg mb-2">Configuration Mismatch!</h3>
                <p>The application's frontend and backend are using different VAPID keys.</p>
                <p className="mt-2">Please ask the site administrator to redeploy the application and then clear your site data before trying again.</p>
              </div>
          ) : (
          <>
              <p className="text-gray-600 mb-6">
              This demo shows how to use the Push API to send notifications to users.
              </p>
              <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold text-lg text-gray-700 mb-2">Status</h3>
                  {renderStatus()}
              </div>
              {!isSubscribed && notificationPermission !== 'granted' && (
                  <button
                  onClick={handleRequestPermission}
                  disabled={notificationPermission === 'denied'}
                  className="w-full bg-indigo-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 disabled:bg-gray-400 disabled:cursor-not-allowed transition duration-150 ease-in-out"
                  >
                  {notificationPermission === 'denied' ? 'Permission Denied' : 'Enable Notifications'}
                  </button>
              )}
              {isSubscribed && (
                  <>
                  <button
                      onClick={handleTestNotification}
                      className="w-full bg-green-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition duration-150 ease-in-out"
                  >
                      Send a Test Notification
                  </button>
                  <button
                      onClick={handleReset}
                      className="w-full bg-yellow-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-opacity-50 transition duration-150 ease-in-out"
                  >
                      Reset Subscription
                  </button>
                  </>
              )}
              </div>
              {subscription && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg text-xs text-gray-600 overflow-x-auto">
                  <h4 className="font-semibold text-sm text-gray-700 mb-2">Subscription Details (for debugging)</h4>
                  <pre><code>{JSON.stringify(subscription, null, 2)}</code></pre>
              </div>
              )}
          </>
          )}
        </div>
      </main>
    </div>
  );
};

export default PushNotificationPage;
