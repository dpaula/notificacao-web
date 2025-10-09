// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const webpush = require('web-push');

// --- Environment Variable Validation ---
const requiredEnvVars = [
  'VITE_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'API_TOKEN',
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('ERROR: Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

const {
  PORT = 8080,
  VITE_VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT,
  API_TOKEN,
  ALLOWED_ORIGINS,
} = process.env;

// --- Web Push Configuration ---
webpush.setVapidDetails(
  VAPID_SUBJECT,
  VITE_VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// --- Express App Setup ---
const app = express();

// --- Middlewares ---

// CORS Configuration
const corsOptions = {
  origin: (origin, callback) => {
    const allowed = ALLOWED_ORIGINS ? ALLOWED_ORIGINS.split(',') : [];
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
};
app.use(cors(corsOptions));

// Body Parser
app.use(express.json());

// --- API Routes ---

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true });
});

// Authentication Middleware for Push Endpoint
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Authorization header missing or malformed' });
  }
  const token = authHeader.split(' ')[1];
  if (token !== API_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Invalid API token' });
  }
  next();
};

// Send Push Notification Endpoint
app.post('/api/push/send', authenticate, async (req, res) => {
  const { subscription, notification } = req.body;

  // --- Payload Validation ---
  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return res.status(400).json({ ok: false, error: 'Invalid subscription object' });
  }
  if (!notification || !notification.title || !notification.body) {
    return res.status(400).json({ ok: false, error: 'Notification object must contain title and body' });
  }

  try {
    const payload = JSON.stringify(notification);
    const options = {
      ttl: notification.ttl || 60, // Default TTL of 60 seconds
    };

    const pushResult = await webpush.sendNotification(subscription, payload, options);
    
    res.status(200).json({ ok: true, status: pushResult.statusCode });

  } catch (error) {
    console.error('Failed to send push notification:', {
      statusCode: error.statusCode,
      body: error.body,
    });
    
    if (error.statusCode === 410 || error.statusCode === 404) {
      return res.status(410).json({ ok: false, status: error.statusCode, reason: 'subscription gone' });
    }
    
    return res.status(500).json({ ok: false, error: 'Failed to send notification' });
  }
});


// --- Static File Serving ---
const staticPath = path.join(__dirname, 'dist');
app.use(express.static(staticPath));

// Catch-all for single-page application (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});


// --- Server Start ---
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});