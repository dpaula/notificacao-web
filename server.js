// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const webpush = require('web-push');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 8080;

// --- Environment Variable Validation ---
const requiredEnvVars = [
  'VITE_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'API_TOKEN'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error(`ERROR: Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// --- VAPID Configuration ---
const vapidKeys = {
  publicKey: process.env.VITE_VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
};

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// --- Middleware ---
app.use(express.json());

// CORS Configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim().replace(/\/$/, '')) // Trim whitespace and remove trailing slashes
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  }
}));

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));


// --- In-memory storage for the last subscription ---
let lastSubscription = null;


// --- API Routes ---

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true });
});

// [NEW] Endpoint to expose the public VAPID key for frontend verification
app.get('/api/vapid-key', (req, res) => {
  res.status(200).json({ publicKey: vapidKeys.publicKey });
});

// Middleware for API Token Authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <TOKEN>

  if (token == null) {
    return res.status(401).json({ ok: false, reason: 'Authorization token is required' });
  }

  if (token !== process.env.API_TOKEN) {
    return res.status(403).json({ ok: false, reason: 'Invalid authorization token' });
  }

  next();
};

// Register a subscription from the frontend
app.post('/api/push/register', (req, res) => {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ ok: false, reason: 'Invalid subscription object' });
    }
    lastSubscription = subscription;
    console.log('[Server] New subscription registered.');
    res.status(201).json({ ok: true });
});

// Get the last registered subscription
app.get('/api/push/last-subscription', (req, res) => {
    if (lastSubscription) {
        res.status(200).json(lastSubscription);
    } else {
        res.status(404).json({ ok: false, reason: 'No subscription registered yet' });
    }
});

// Delete the last registered subscription
app.delete('/api/push/last-subscription', (req, res) => {
    console.log('[Server] Last subscription has been cleared.');
    lastSubscription = null;
    res.status(200).json({ ok: true });
});

// Simple push endpoint
app.post('/api/push/simple', authenticateToken, async (req, res) => {
    if (!lastSubscription) {
        return res.status(400).json({ ok: false, reason: 'No subscription is registered on the server.' });
    }

    const { title, body } = req.body;
    if (!title || !body) {
        return res.status(400).json({ ok: false, reason: 'Request must include "title" and "body".' });
    }

    const notificationPayload = JSON.stringify({ title, body });

    try {
        const pushResult = await webpush.sendNotification(lastSubscription, notificationPayload);
        res.status(200).json({ ok: true, status: pushResult.statusCode });
    } catch (err) {
        console.error('Error sending simple push notification:', err.body || err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
            lastSubscription = null; // Clean up expired subscription
            return res.status(410).json({ ok: false, status: err.statusCode, reason: 'Subscription is invalid or expired. It has been removed.' });
        }
        res.status(500).json({ ok: false, status: err.statusCode, reason: 'Failed to send notification' });
    }
});


// Detailed push endpoint
app.post('/api/push/send', authenticateToken, async (req, res) => {
  const { subscription, notification } = req.body;

  // Validate subscription
  if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
    return res.status(400).json({ ok: false, reason: 'Invalid subscription object' });
  }

  // Validate notification payload
  if (!notification || !notification.title || !notification.body) {
    return res.status(400).json({ ok: false, reason: 'Notification object must contain title and body' });
  }

  const payload = JSON.stringify(notification);
  const options = {
    ttl: notification.ttl || 60,
  };

  try {
    const pushResult = await webpush.sendNotification(subscription, payload, options);
    res.status(200).json({ ok: true, status: pushResult.statusCode });
  } catch (err) {
    console.error('Error sending push notification:', err.body || err.message);
    if (err.statusCode === 410 || err.statusCode === 404) {
      return res.status(410).json({ ok: false, status: err.statusCode, reason: 'Subscription gone or invalid' });
    }
    res.status(500).json({ ok: false, status: err.statusCode || 500, reason: 'Failed to send notification' });
  }
});


// --- Serve SPA ---
// This should be the last route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});


// --- Start Server ---
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});