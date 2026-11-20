# Team Work

Team-only Android file sharing and device support for the AAO team.

## What is in this first build

- Staff APK: signs in, reports its device online while the app is open, and uploads files the staff member selects.
- Admin APK: signs in, creates staff accounts, checks online devices, and downloads team files.
- Server: authenticates admin/staff roles, stores uploaded files and presence records, and supplies the API.
- GitHub Actions: builds separate staff and admin debug APKs.

The Android APKs do not install on PCs or laptops. A separate Windows desktop agent is not included yet.

## Not included in this build

Live screen sharing, voice/video calling, and remote touch control are still to be implemented. The current APKs should be used to try the account, presence, and file-sharing flow only.

## Build artifacts

Open the latest successful run under Actions and download the team-work-debug-apks artifact. Each artifact ZIP contains:
- staff/debug/app-staff-debug.apk
- admin/debug/app-admin-debug.apk

## Server and first test

Deploy the Node server from the server folder behind HTTPS. Set a strong JWT_SECRET, ADMIN_EMAIL, and ADMIN_PASSWORD, and preserve the server data volume. Sign in to the Admin APK using those credentials, create a staff account, then sign in to the Staff APK and choose a file to share. Enter the server's HTTPS address on both apps.

See server/README.md for Docker setup and API details. The server must be deployed before the APKs can exchange files over the internet.
