# Web Push Notification Requester & Server

This project is a complete solution for requesting web push notification permissions from users and sending them notifications via a secure backend API.

It consists of two main parts:
1.  **Frontend**: A React application (built with esbuild) that provides a clean user interface for requesting notification permissions, handling different states (granted, denied, error), and displaying the user's push subscription details.
2.  **Backend**: A minimal Node.js/Express server that serves the frontend, and exposes a secure API endpoint to trigger push notifications to a specific user subscription.

## Features

-   **Clean UI**: User-friendly interface to request notification permissions.
-   **State Management**: Robust state machine handles checking, permission requests, subscription status, and errors.
-   **VAPID Key Handling**: Securely uses VAPID keys from environment variables.
-   **Subscription Management**: Allows users to copy their subscription details and reset it if needed.
-   **Test Notifications**: Users can trigger a local test notification from the UI.
-   **Secure Backend API**: An endpoint to send notifications, protected by a bearer token.
-   **Static Serving**: The Node.js server serves the production-ready frontend application.

## Getting Started

### Prerequisites

-   Node.js (v16 or later)
-   npm

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Generate VAPID Keys:**
    If you don't have VAPID keys, you can generate them using the `web-push` library.
    ```bash
    npx web-push generate-vapid-keys
    ```
    Keep the public and private keys safe.

4.  **Create `.env` file:**
    Copy the `.env.example` to a new file named `.env` and fill in the required values.
    ```bash
    cp .env.example .env
    ```

### Environment Variables

You need to configure the following environment variables in your `.env` file:

| Variable                  | Description                                                                                               | Scope     |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| `VITE_VAPID_PUBLIC_KEY`   | **Required.** Your VAPID public key. Used by the frontend to subscribe.                                     | Frontend  |
| `VAPID_PRIVATE_KEY`       | **Required.** Your VAPID private key. Used by the backend to sign push notifications.                       | Backend   |
| `VAPID_SUBJECT`           | **Required.** A URL or `mailto:` address for contact. Example: `mailto:admin@example.com`                   | Backend   |
| `API_TOKEN`               | **Required.** A secret token to authorize requests to the `/api/push/send` endpoint.                        | Backend   |
| `PORT`                    | *Optional.* The port for the server to run on. Defaults to `8080`.                                         | Backend   |
| `ALLOWED_ORIGINS`         | *Optional.* Comma-separated list of origins allowed by CORS. Useful for tools like n8n or Postman.         | Backend   |


## Available Scripts

-   **`npm run dev`**: Starts a local development server for the frontend using `esbuild`.
-   **`npm run build`**: Builds the frontend application for production and places the output in the `dist/` directory.
-   **`npm start`**: Starts the Node.js/Express server to serve the production build from `dist/` and run the API.

## API Usage

### Send Push Notification

-   **Endpoint**: `POST /api/push/send`
-   **Auth**: `Authorization: Bearer <your_api_token>`
-   **Body**: JSON payload with subscription and notification details.

#### Example `curl` Request

Replace `YOUR_API_TOKEN` and the `subscription` object with your actual data.

```sh
curl -X POST https://your-domain.com/api/push/send \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subscription": {
      "endpoint": "https://fcm.googleapis.com/fcm/send/...",
      "expirationTime": null,
      "keys": {
        "p256dh": "...",
        "auth": "..."
      }
    },
    "notification": {
      "title": "Hello from API!",
      "body": "This is a push notification sent from the backend.",
      "url": "https://your-domain.com/some-page"
    }
  }'
```

### API Responses

-   **`200 OK`**: The push notification was successfully sent to the push service.
-   **`400 Bad Request`**: The request body is missing required fields (e.g., `subscription` or `notification.title`).
-   **`401 Unauthorized`**: The `Authorization` header is missing or the token is invalid.
-   **`410 Gone`**: The subscription is no longer valid and should be removed.
-   **`500 Internal Server Error`**: An unexpected error occurred on the server while trying to send the notification.
