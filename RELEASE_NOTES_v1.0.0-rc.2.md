# EventSync v1.0.0-rc.2 — Community & Scheduling Update

Pre-release source snapshot reconstructed from prior EventSync packages and feature patches.

## Included
- Java 21 Spring Boot API, MySQL and Flyway migrations V1–V6
- Figma/React frontend and Docker Compose/Caddy deployment files
- System administrators and group features
- Public event announcements, group attendance/insights
- Event cancellation improvements and monochrome sidebar icons
- Drag-to-paint availability/unavailability
- Usernames with numeric tags, organization event publishers and support inbox
- Support ticket type/status filters
- Account-synchronized theme colors

## Not included
- Live database content, users' event data, account credentials, OAuth secrets or keys
- Ticketmaster API integration (discussed but not implemented in available source)
- Any uncollected edits made directly on the running EventSync VM

## Deployment
Copy `.env.example` to `.env` and supply your own secrets, including a fresh encryption key. Do NOT upload `.env` to GitHub. Refer to README.md and README_RELEASE.md for build/deployment instructions. Back up your MySQL database before applying Flyway migrations.

## Verification status
Source archive assembled and scanned for known secret patterns. Integration builds and live server testing are NOT verified for this combined release. Validate Java/React builds and migration paths before a production release.
