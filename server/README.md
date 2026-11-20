# Team Work API — first milestone

This API supports team sign-in, admin-created staff accounts, online heartbeat, and team file exchange. Screen streaming, voice/video calls, and remote input are not implemented in this first milestone; they need a separate WebRTC and support-session integration with visible user consent.

## Run with Docker

    docker build -t team-work-api ./server
    docker run --name team-work-api -p 8080:8080 \
      -e JWT_SECRET='replace-with-random-secret-of-32-or-more-characters' \
      -e ADMIN_EMAIL='admin@yourcompany.com' \
      -e ADMIN_PASSWORD='choose-a-long-temporary-password' \
      -v team-work-data:/app/data team-work-api

Put the service behind an HTTPS reverse proxy before connecting phones. Preserve /app/data for the SQLite database and shared files. Set the same HTTPS URL in each APK at sign-in.

The admin logs in using ADMIN_EMAIL and ADMIN_PASSWORD. Create staff accounts by sending POST /api/staff with the admin bearer token and JSON containing email and password. Temporary passwords must have at least 12 characters.

## Endpoints

- POST /api/login: email, password, and role (admin or staff)
- POST /api/staff: admin creates a staff account
- POST /api/heartbeat: authenticated device presence
- GET /api/devices: admin device presence
- POST /api/files: upload one selected file (100 MB maximum)
- GET /api/files: list team files
- GET /api/files/:id/download: download a shared file

Use TLS, a strong JWT secret, and regular backups. Do not expose the development server directly to the public internet.
