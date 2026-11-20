# Team Work

Private team file sharing and support meetings for AAO staff.

## Current build (0.2)

- Staff enroll with their name and a one-time 10-character pairing code issued by an admin. No staff email/password setup.
- Admin APK signs in using the server's admin account, issues one-use pairing codes (10-minute expiry), sees device presence, lists shared files, and creates meeting codes.
- Staff APK uploads files they explicitly select, downloads files shared with the team, and joins admin-created meetings.
- Android meetings support voice/video calls and screen sharing through Jitsi Meet. Android shows its own permission and screen-capture consent prompts when those functions start.
- Windows installer supports admin/staff sign-in, meetings, screen sharing, and consented remote control. The Windows user must approve remote control in a native allow/deny dialog.
- Node API handles admin-only pairing-code generation, pairing, files, device presence, and short-lived meeting codes.

Android remote touch control is not included. Android file access is limited to files the person selects; the app does not silently read gallery, contacts, or other personal data.

## Build artifacts

GitHub Actions builds separate staff and admin debug APKs plus a Windows installer. Get the latest successful builds from [GitHub Actions](https://github.com/MAKAAO/team/actions).

## Setup

Deploy the Node server in `server/` behind HTTPS, set a strong `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`, and persist `/app/data`. Enter that HTTPS API URL in both Android apps and the Windows client.

The Android call/screen-share SDK needs an HTTPS Jitsi server. The public default is only for basic testing. For a team-only deployment, configure an authenticated private Jitsi server and restrict access to your team.

See [server/README.md](server/README.md) and [desktop/README.md](desktop/README.md) for setup details.
