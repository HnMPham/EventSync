# EventSync v1.0.0-rc.3 — Consolidated Source Release

Source-only update reconstructed from the prior rc.2 release and all subsequent patch packages available in this conversation (November 23, 2026).

## Features
- React/TypeScript, Java Spring Boot, MySQL, Docker Compose and Caddy
- Microsoft Outlook integration code, private local Docker demo launchers
- User accounts, friends, username tags, groups and scheduling
- Availability / unavailability painting and ranked automatic meeting-time suggestions across invited users and groups
- Finalized scheduling meetings shown in the normal Events calendar to authorized participants
- Deleting past and cancelled scheduling events, and no misleading finalized date on cancelled events
- Public events, organization publishers, attendance insights
- System administration, support tickets with request/report and status filters
- Persistent account-level theme color preferences
- Cancellation improvements and consistent monochrome navigation icons

Ticketmaster discovery was discussed but never implemented, so it is not included.

## Security and testing
- Runtime .env files, secrets, private keys, Git history, and database files are excluded from this archive.
- A pattern scan of the packaged source was performed, but manual secret review is still recommended.
- Patch installers applied successfully against a local reconstructed rc.2 base; live GitHub release contents were NOT independently fetched, and live production builds were NOT run.
- This is an RC, not a certified production build.

## Updating GitHub
This ZIP has its project files at ZIP root (src/, figma-source/, compose.yaml...), so extract it and upload the CONTENTS of the extracted folder into the root of your repository. Same-path files are replaced; old files absent from this ZIP are not automatically deleted. GitHub release attachments alone never replace tagged GitHub source code. Create a NEW tag v1.0.0-rc.3 from the updated main branch. Don't overwrite or retag rc.2.

## Updating deployed VM
This archive is NOT a one-click upgrade of an installed EventSync VM. Back up DB and source first, and carefully compare locally modified files. Never overwrite .env or delete persistent MySQL volumes.

## Local demo
With Docker and Compose installed, run `bash Launch-EventSync.sh` on Linux or `Launch-EventSync.bat` on Windows. First launch requires image and npm dependency downloads. Starts at http://localhost:8090, and uses a distinct local MySQL volume.
