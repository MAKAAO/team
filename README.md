# Team Work

Team-only file sharing and remote support for AAO staff.

## Components
- Staff Android app: sign in, show online presence, choose files to upload/share, and accept support sessions.
- Admin Android app: view team status and shared files, download files, and request a support session.
- Server: authentication, role checks, file storage, presence, call signaling, and session audit.
- Windows desktop agent: separate installer for staff PCs/laptops; an Android APK cannot run on desktop operating systems.

## Privacy and Android limits
Android asks the staff member to approve screen capture for each session. Gallery files are selected by the staff member. Remote control can only run during an accepted support session after the user manually enables Android Accessibility access. The app shows a persistent session indicator and a stop control. The app does not silently copy contacts, answer cellular calls, or start screen capture.

## Build status
This repository was empty when setup began. The first milestone is the installable Android app pair and server source. A reachable HTTPS server and TURN relay are required for real-time use across the internet. GitHub Actions will build debug APKs after the Android source is added.

## Local server
See `server/README.md` for deployment and configuration instructions.
