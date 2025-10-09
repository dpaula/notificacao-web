// FIX: Replaced placeholder content with a functional React component to handle web push notification subscriptions.
import React, { useState, useEffect } from 'react';
import { BellIcon } from './components/BellIcon';
import { CheckCircleIcon } from './components/CheckCircleIcon';
import { XCircleIcon } from './components/XCircleIcon';
import { InfoIcon } from './components/InfoIcon';

// Helper function to convert VAPID key from URL-safe base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const App: React.FC = () => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for service worker and push manager support
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      // Wait for the service worker to be ready
      navigator.serviceWorker.ready.then(registration => {
        setNotificationPermission(Notification.permission);
        // If permission is already granted, check for an existing subscription
        if (Notification.permission === 'granted') {
          registration.pushManager.getSubscription().then(sub => {
            if (sub) {
              setIsSubscribed(true);
              setSubscription(sub);
            }
            setIsLoading(false);
          });
        } else {
            setIsLoading(false);
        }
      });
    } else {
        console.warn('Push messaging is not supported');
        setIsLoading(false);
    }
  }, []);

  const subscribeUser = async () => {
    if (!('serviceWorker' in navigator)) {
        console.warn('Service Worker not supported');
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        // Request notification permission from the user
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        
        if (permission === 'granted') {
            console.log('Notification permission granted.');

            const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
            if (!vapidPublicKey) {
                console.error('VITE_VAPID_PUBLIC_KEY is not set.');
                return;
            }
            const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

            // Subscribe the user
            const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey
            });

            console.log('User is subscribed:', sub);
            setSubscription(sub);
            setIsSubscribed(true);
            
            // In a real application, you would send the subscription object to your server
            // to store it for sending push notifications later.
        } else {
            console.warn('Notification permission was not granted.');
        }
    } catch (error) {
        console.error('Failed to subscribe the user: ', error);
    }
  };

  // Renders the current status of the notification subscription
  const renderStatus = () => {
    if (isLoading) {
        return <p className="text-gray-500">Checking status...</p>
    }

    if (notificationPermission === 'denied') {
        return (
            <div className="flex items-center text-red-500">
                <XCircleIcon className="w-6 h-6 mr-2" />
                <p>Permission denied. Enable notifications in browser settings.</p>
            </div>
        );
    }

    if (isSubscribed) {
        return (
            <div className="flex items-center text-green-500">
                <CheckCircleIcon className="w-6 h-6 mr-2" />
                <p>You are subscribed to notifications!</p>
            </div>
        );
    }

    return (
        <div className="flex items-center text-gray-700">
            <InfoIcon className="w-6 h-6 mr-2" />
            <p>Click the button below to enable notifications.</p>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 font-sans text-gray-800">
        <div className="w-full max-w-md mx-auto bg-white rounded-xl shadow-lg p-8 text-center">
            <BellIcon className="w-16 h-16 mx-auto text-blue-500 mb-4" />
            <h1 className="text-3xl font-bold mb-2">Web Push Notifications</h1>
            <p className="text-gray-600 mb-6">
                Enable notifications to stay updated.
            </p>
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
                <h2 className="font-semibold text-lg mb-2">Current Status</h2>
                {renderStatus()}
            </div>
            
            <button
                onClick={subscribeUser}
                disabled={isSubscribed || notificationPermission === 'denied' || isLoading}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            >
                {isLoading ? 'Loading...' : isSubscribed ? 'Subscribed' : 'Enable Notifications'}
            </button>
            {subscription && (
                <div className="mt-6 text-left bg-gray-100 p-4 rounded-lg border overflow-x-auto">
                    <h3 className="font-semibold mb-2">Subscription Object:</h3>
                    <pre className="text-xs bg-gray-800 text-white p-3 rounded-md">
                        <code>{JSON.stringify(subscription, null, 2)}</code>
                    </pre>
                </div>
            )}
        </div>
    </div>
  );
};

export default App;
