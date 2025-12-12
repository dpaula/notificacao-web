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
        <div className="flex items-center text-brand-red">
          <XCircleIcon className="w-6 h-6 mr-2" />
          <span>{error}</span>
        </div>
      );
    }
    switch (notificationPermission) {
      case 'granted':
        return (
          <div className="flex items-center text-brand-lime">
            <CheckCircleIcon className="w-6 h-6 mr-2" />
            <span>Notifications are enabled.</span>
          </div>
        );
      case 'denied':
        return (
          <div className="flex items-center text-brand-red">
            <XCircleIcon className="w-6 h-6 mr-2" />
            <span>Notifications are blocked. Please enable them in your browser settings.</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center text-muted">
            <InfoIcon className="w-6 h-6 mr-2" />
            <span>Please enable notifications to receive updates.</span>
          </div>
        );
    }
  };

  return (
    <div className="app-shell flex min-h-screen flex-col">
      <header className="pb-6 pt-8">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">Notificações</p>
              <h1 className="mt-2 text-2xl font-semibold text-white">Notificações Push</h1>
              <p className="mt-2 text-sm text-muted">
                Configure permissões e teste o envio de notificações web.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link to="/faturamentos" className="btn btn-ghost inline-flex items-center justify-center text-sm">
                Visualizar faturamentos
              </Link>
              <Link to="/dematec-meli" className="btn btn-ghost inline-flex items-center justify-center text-sm">
                Abrir Chat Dematec · Meli
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 pb-16 sm:px-6">
        <div className="mx-auto w-full max-w-md">
          <div className="surface p-8">
            <div className="mb-6 flex items-center gap-3">
              <BellIcon className="h-10 w-10 text-brand-lime" />
              <h2 className="text-2xl font-semibold text-white">Push Notifications</h2>
            </div>
          
          {keyMismatchError ? (
              <div className="card card-ring bg-[rgba(224,32,32,0.10)] p-4 text-brand-red">
                <h3 className="text-lg font-semibold text-white">Configuration mismatch</h3>
                <p className="mt-2 text-sm text-muted">
                  The application's frontend and backend are using different VAPID keys.
                </p>
                <p className="mt-2 text-sm text-muted">
                  Ask the administrator to redeploy and then clear site data before trying again.
                </p>
              </div>
          ) : (
          <>
              <p className="mb-6 text-sm text-muted">
              This demo shows how to use the Push API to send notifications to users.
              </p>
              <div className="space-y-4">
              <div className="card card-ring p-4">
                  <h3 className="mb-2 text-sm font-semibold text-white">Status</h3>
                  {renderStatus()}
              </div>
              {!isSubscribed && notificationPermission !== 'granted' && (
                  <button
                  onClick={handleRequestPermission}
                  disabled={notificationPermission === 'denied'}
                  className="btn btn-primary w-full disabled:cursor-not-allowed"
                  >
                  {notificationPermission === 'denied' ? 'Permission Denied' : 'Enable Notifications'}
                  </button>
              )}
              {isSubscribed && (
                  <>
                  <button
                      onClick={handleTestNotification}
                      className="btn btn-primary w-full"
                  >
                      Send a Test Notification
                  </button>
                  <button
                      onClick={handleReset}
                      className="btn btn-ghost w-full text-sm"
                  >
                      Reset Subscription
                  </button>
                  </>
              )}
              </div>
              {subscription && (
              <div className="card card-ring mt-6 p-4 text-xs text-muted overflow-x-auto">
                  <h4 className="mb-2 text-sm font-semibold text-white">Subscription Details (for debugging)</h4>
                  <pre><code>{JSON.stringify(subscription, null, 2)}</code></pre>
              </div>
              )}
          </>
          )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default PushNotificationPage;
