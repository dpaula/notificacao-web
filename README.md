# Web Push Notification Demo

This project is a complete solution for demonstrating, testing, and sending Web Push notifications. It includes:
1.  A **React + TypeScript frontend** for requesting user permission and managing subscriptions.
2.  A **Node.js + Express backend** to serve the frontend and provide a secure API for sending notifications.

## Features

-   **Frontend**:
    -   Clean UI to request notification permissions.
    -   Robust state management (`checking`, `needs-permission`, `subscribed`, `denied`).
    -   Automatically registers its subscription with the backend.
    -   Displays the current VAPID key fingerprint for easy verification.
    -   Includes a "Send Test Notification" button (client-side).
    -   Includes a "Reset Subscription" button to unsubscribe and clear data.
-   **Backend**:
    -   Serves the production-ready frontend (`dist/` folder).
    -   Secure API endpoints protected by a bearer token.
    -   **Simple API (`/api/push/simple`)**: Sends a notification with just a title and body to the last registered device.
    -   **Advanced API (`/api/push/send`)**: Sends a detailed notification payload to a specific subscription object.
    -   Endpoints to view or clear the currently stored subscription.
    -   Configured entirely through environment variables.

## Project Structure

-   `src/`: Frontend React application source code.
-   `dist/`: Production build output of the frontend.
-   `server.js`: The backend Node.js/Express server.
-   `sw.js`: The service worker for handling push notifications.
-   `build.js`: The esbuild script for building the frontend.
-   `.env.example`: Template for required environment variables.

## Setup and Running Locally

1.  **Clone the repository.**

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Generate VAPID Keys:**
    If you don't have VAPID keys, you can generate them:
    ```bash
    npx web-push generate-vapid-keys
    ```
    Keep the public and private keys safe.

4.  **Create `.env` file:**
    Copy `.env.example` to a new file named `.env` and fill in the values:
    ```env
    # For Frontend (Vite)
    VITE_VAPID_PUBLIC_KEY="<Your VAPID Public Key>"

    # For Backend (Node.js)
    VAPID_PRIVATE_KEY="<Your VAPID Private Key>"
    VAPID_SUBJECT="mailto:your-email@example.com"
    API_TOKEN="<Generate a strong, random string for your API token>"
    # Add your production domain and local dev domain for CORS
    ALLOWED_ORIGINS="https://notify.autevia.com.br,http://localhost:8080"
    ```

5.  **Build the Frontend:**
    ```bash
    npm run build
    ```
    This will create the `dist/` directory.

6.  **Start the Server:**
    ```bash
    npm run start
    ```
    The application will be available at `https://notify.autevia.com.br` in production, or `http://localhost:8080` for local development.

## API Endpoints

The following endpoints are available on the backend server. The `/simple` and `/send` endpoints require authentication.

### Authentication

All protected endpoints require an `Authorization` header:
`Authorization: Bearer <Your API_TOKEN>`

---

### 1. Simple Notification

Sends a notification with just a title and body to the last device that subscribed.

-   **Endpoint**: `POST /api/push/simple`
-   **Auth**: Required
-   **Body**:
    ```json
    {
      "title": "Hello from API!",
      "body": "This is a simple notification."
    }
    ```
-   **Example `curl`**:
    ```sh
    curl -X POST https://notify.autevia.com.br/api/push/simple \
      -H "Authorization: Bearer YOUR_API_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{ "title": "Test Title", "body": "This is the message body." }'
    ```

### 2. Advanced Notification

Sends a detailed notification to a specific subscription object.

-   **Endpoint**: `POST /api/push/send`
-   **Auth**: Required
-   **Body**:
    ```json
    {
      "subscription": {
        "endpoint": "...",
        "keys": { "p256dh": "...", "auth": "..." }
      },
      "notification": {
        "title": "Advanced Notification",
        "body": "With more options!",
        "url": "https://example.com"
      }
    }
    ```

### 3. Register Subscription (Used by Frontend)

The frontend automatically calls this endpoint to save its subscription on the server.

-   **Endpoint**: `POST /api/push/register`
-   **Auth**: Not Required
-   **Body**: A valid PushSubscription object.

### 4. View Last Subscription

Retrieves the subscription object currently stored on the server.

-   **Endpoint**: `GET /api/push/last-subscription`
-   **Auth**: Not Required

### 5. Delete Last Subscription

Clears the stored subscription from the server.

-   **Endpoint**: `DELETE /api/push/last-subscription`
-   **Auth**: Not Required

### 6. Health Check

A simple endpoint to check if the server is running.

-   **Endpoint**: `GET /api/health`
-   **Auth**: Not Required
-   **Response**: `{"ok": true}`