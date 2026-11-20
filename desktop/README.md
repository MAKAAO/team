# Team Work Windows client

Build the Windows installer from a Windows GitHub Actions runner. Staff connect with the one-time code issued by the admin app. Admins sign in with their admin credentials. Both can join short-lived meeting codes created by the admin.

The Jitsi Electron SDK supplies desktop screen sharing and remote control. Every remote-control request is protected by a native Windows dialog with Deny selected by default; the staff member must click Allow for this session. Screen share is separately started by the participant in the meeting.

## Build locally (Windows)

    npm ci
    npm run dist:win

The desktop client needs a reachable HTTPS Team Work API and an HTTPS Jitsi meeting server. For private team use, configure the meeting-server field to an authenticated Jitsi deployment. The default public Jitsi server is for basic smoke testing only.
