# Team Work API

Node.js API for one-time staff pairing, device presence, team file exchange, and short-lived meeting codes.

## Run with Docker

    docker build -t team-work-api ./server
    docker run --name team-work-api -p 8080:8080 \
      -e JWT_SECRET='replace-with-random-secret-of-32-or-more-characters' \
      -e ADMIN_EMAIL='admin@yourcompany.com' \
      -e ADMIN_PASSWORD='choose-a-long-temporary-password' \
      -v team-work-data:/app/data team-work-api

Put the service behind an HTTPS reverse proxy before connecting phones. Preserve /app/data for the SQLite database and shared files. Set the same HTTPS URL in the clients.

The admin signs in using ADMIN_EMAIL and ADMIN_PASSWORD, then creates pairing codes in the admin client. Each code is single-use and expires after 10 minutes. Staff enter their name and code; the API creates their account and returns a device token. No open staff registration route is provided.

## Endpoints

- POST /api/login: admin credentials and role (admin)
- POST /api/pairing-codes: admin-only, returns one-time 10-character pairing code
- POST /api/pair: staff name and pairing code; creates staff account/device token
- POST /api/heartbeat: authenticated device presence
- GET /api/devices: admin device presence
- POST /api/files: upload one or more explicitly selected files (100 MB maximum per file)
- GET /api/files: list team files
- GET /api/files/:id/download: download a shared file
- POST /api/meetings: admin creates a short-lived meeting code
- POST /api/meetings/join: paired admin/staff validates and joins a meeting code

Use TLS, a strong JWT secret, and regular backups. Do not expose the development server directly to the public internet. For private team calls, configure an authenticated Jitsi server; the default public Jitsi service is suitable only for basic testing.

Android uses system document selection for file access and asks the device owner before starting mic, camera, or screen capture. Android remote touch control is not implemented.
