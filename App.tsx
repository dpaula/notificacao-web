// FIX: Replaced placeholder content with a functional React component to handle web push notification subscriptions.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BellIcon } from './components/BellIcon';
import { CheckCircleIcon } from './components/CheckCircleIcon';
import { XCircleIcon } from './components/XCircleIcon';
import { InfoIcon } from './components/InfoIcon';
import { NotificationIcon } from './components/NotificationIcon';

// --- TYPE DEFINITIONS ---
type Status = 'checking' | 'needs-permission' | 'subscribed' | 'denied' | 'error' | 'unsupported';

// --- HELPER FUNCTIONS ---
function urlBase64ToUint8Array(base64String: string) {
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
  // --- STATE MANAGEMENT ---
  const [status, setStatus] = useState<Status>('checking');
  const [subscription, setSubscription] = useState<PushSubscriptionJSON | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const VAPID_PUBLIC_KEY = (import.meta as any).env.VITE_VAPID_PUBLIC_KEY;

  const vapidKeyFingerprint = useMemo(() => {
    if (!VAPID_PUBLIC_KEY) return "Not Configured";
    return `${VAPID_PUBLIC_KEY.slice(0, 6)}...${VAPID_PUBLIC_KEY.slice(-6)}`;
  }, [VAPID_PUBLIC_KEY]);

  // --- CORE LOGIC & SIDE EFFECTS ---
  const initialize = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) {
      setStatus('error');
      setError("VAPID Public Key is not configured. Please set VITE_VAPID_PUBLIC_KEY environment variable.");
      return;
    }
    if (!('serviceWorker' in navigator && 'PushManager' in window)) {
      setStatus('unsupported');
      return;
    }

    try {
      await navigator.serviceWorker.register('/sw.js');
      const registration = await navigator.serviceWorker.ready;

      if (Notification.permission === 'denied') {
        setStatus('denied');
        return;
      }
      
      const sub = await registration.pushManager.getSubscription();
      const storedVapidKey = localStorage.getItem('vapidPublicKey');

      if (sub && storedVapidKey) {
        if (storedVapidKey !== VAPID_PUBLIC_KEY) {
           setStatus('error');
           setError("The VAPID key has changed. Please reset your subscription.");
        } else {
          setSubscription(sub.toJSON());
          setStatus('subscribed');
        }
      } else {
        setStatus('needs-permission');
      }
    } catch (err) {
      console.error('Initialization error:', err);
      setStatus('error');
      setError('An unexpected error occurred during setup. Please try again.');
    }
  }, [VAPID_PUBLIC_KEY]);

  useEffect(() => {
    setStatus('checking');
    const timeout = setTimeout(() => {
      if (status === 'checking') {
        console.warn('Initialization is taking a long time. Moving to prompt state.');
        setStatus('needs-permission');
      }
    }, 2500); // 2.5 second timeout

    initialize();

    return () => clearTimeout(timeout);
  }, [initialize]);


  // --- USER ACTIONS ---
  const handleSubscribe = async () => {
    setStatus('checking');
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        setStatus('denied');
        return;
      }
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        const subJSON = sub.toJSON();
        setSubscription(subJSON);
        localStorage.setItem('pushSubscription', JSON.stringify(subJSON));
        localStorage.setItem('vapidPublicKey', VAPID_PUBLIC_KEY);
        setStatus('subscribed');
      } else {
        setStatus('needs-permission');
      }
    } catch (err) {
      console.error('Subscription failed:', err);
      setStatus('error');
      setError('Failed to subscribe. Please try again.');
    }
  };

  const handleReset = async () => {
    setStatus('checking');
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
      }
    } catch (err) {
      console.error('Unsubscribe failed:', err);
      // Continue with cleanup even if unsubscribe fails
    } finally {
      localStorage.removeItem('pushSubscription');
      localStorage.removeItem('vapidPublicKey');
      setSubscription(null);
      setStatus('needs-permission');
    }
  };

  const copySubscription = () => {
    if (subscription) {
      navigator.clipboard.writeText(JSON.stringify(subscription, null, 2));
      alert('Subscription copied to clipboard!');
    }
  };
  
  const sendTestNotification = () => {
      if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'SHOW_TEST_NOTIFICATION' });
      } else {
          alert("Service worker is not active. Please reload the page.");
      }
  };

  // --- RENDER LOGIC ---
  const renderContent = () => {
    switch (status) {
      case 'checking':
        return <div className="text-gray-500">Checking status...</div>;
      case 'unsupported':
        return <div className="flex items-center text-yellow-600"><XCircleIcon className="w-6 h-6 mr-2" /><p>Web Push is not supported on this browser.</p></div>;
      case 'denied':
        return <div className="text-red-500 text-center"><XCircleIcon className="w-8 h-8 mx-auto mb-2" /><p>Notifications are blocked. Please enable them in your browser settings to continue.</p></div>;
      case 'error':
        return (
          <div className="text-red-500 text-center">
            <XCircleIcon className="w-8 h-8 mx-auto mb-2" />
            <p className="font-semibold mb-2">An Error Occurred</p>
            <p className="text-sm mb-4">{error}</p>
            <button onClick={handleReset} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg text-sm">Reset and Try Again</button>
          </div>
        );
      case 'subscribed':
        return (
            <div className="w-full text-left">
                <div className="flex items-center text-green-600 mb-4">
                    <CheckCircleIcon className="w-6 h-6 mr-2" />
                    <p className="font-semibold">You are subscribed to notifications!</p>
                </div>
                <div className="bg-gray-100 p-4 rounded-lg border overflow-x-auto">
                    <h3 className="font-semibold mb-2">Subscription Details:</h3>
                    <textarea readOnly className="w-full h-40 text-xs bg-gray-800 text-white p-3 rounded-md font-mono" value={JSON.stringify(subscription, null, 2)}></textarea>
                    <div className="flex space-x-2 mt-2">
                        <button onClick={copySubscription} className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg text-sm">Copy</button>
                        <button onClick={sendTestNotification} className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg text-sm">Send Test</button>
                    </div>
                </div>
                <button onClick={handleReset} className="w-full mt-4 bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg text-sm">Reset Subscription</button>
            </div>
        );
      case 'needs-permission':
      default:
        return (
          <div className="w-full text-center">
            <BellIcon className="w-16 h-16 mx-auto text-blue-500 mb-4" />
            <h1 className="text-3xl font-bold mb-2">Stay Updated</h1>
            <p className="text-gray-600 mb-6">Enable notifications to receive the latest news and updates directly on your device.</p>
            {/* FIX: Removed redundant `status === 'checking'` comparisons.
                Inside this `switch case`, the type of `status` is narrowed to 'needs-permission',
                so these comparisons were always false and caused TypeScript errors.
                The runtime behavior is preserved. */}
            <button
                onClick={handleSubscribe}
                disabled={!VAPID_PUBLIC_KEY}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-busy={false}
              >
                Enable Notifications
            </button>
          </div>
        );
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 font-sans text-gray-800">
      <div className="w-full max-w-md mx-auto bg-white rounded-xl shadow-lg p-8 flex flex-col items-center">
        {renderContent()}
      </div>
       <footer className="w-full max-w-md mx-auto text-center mt-4 text-xs text-gray-500">
          <p>VAPID Key Fingerprint: <code className="font-mono bg-gray-200 p-1 rounded">{vapidKeyFingerprint}</code></p>
          <p className="mt-1">
            Status: <span className="font-semibold">{status}</span>. For first-time use, user interaction is required.
          </p>
      </footer>
    </main>
  );
};

export default App;
