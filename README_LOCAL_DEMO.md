# EventSync – local classroom demo launcher

Works from the full EventSync source folder on Linux or Windows. **Requires Docker Engine + Docker Compose v2 (Linux), or Docker Desktop (Windows), running with an internet connection on first use.** This is a launcher, **not** a dependency-free executable or a prebuilt compiled binary.

## Start

- Windows: double-click **Launch-EventSync.bat** (Docker Desktop should be running).
- Linux: run `bash Launch-EventSync.sh` inside the source folder. Optional: `chmod +x Launch-EventSync.sh Stop-EventSync.sh` to execute directly.
- Open **http://localhost:8090**. On first launch, expect downloads, a frontend build, and a Java Docker build before the site responds.

## Stop

- Windows: double-click **Stop-EventSync.bat**.
- Linux: `bash Stop-EventSync.sh`.

The local-demo MySQL volume persists between stops. **Never run `docker compose down -v` unless you intend to permanently delete the demo database.**

## What it does

1. Verifies Docker and Compose are present and Docker is running.
2. Creates **.env.local-demo**, containing randomly generated passwords and an encryption key, without exposing them on-screen (only if absent).
3. Uses a separate Compose project `eventsync-class-demo` and dedicated MySQL volume `eventsync_class_demo_mysql_data` to avoid touching a standard EventSync deployment.
4. Builds the React frontend inside a temporary Node.js container if `figma-dist/index.html` is absent.
5. Runs MySQL, Java API, and Caddy with Docker Compose, then opens the browser.

No Microsoft Entra credentials are needed for normal local scheduling. Outlook integration requires separate valid credentials and a matching redirect registration. There is no Ticketmaster integration in this release.

## Caveats

- TCP localhost ports **8080 and 8090** must be available. If another EventSync instance uses them, stop that deployment before launching the local demo.
- Internet and several GB of downloads may be required on first run. For a classroom without internet, run once in advance, then test offline.
- A new local database is **empty**. Create a demo user/group ahead of the presentation.
- Linux users need permission to run Docker; Windows requires Docker Desktop to be ready.
- The package contains **no personal `.env` or keys**. Your generated `.env.local-demo` is private and must never be committed or added to a public ZIP.
- If something fails, from the source folder run:
  `docker compose --env-file .env.local-demo -p eventsync-class-demo -f compose.yaml -f compose.caddy.local.yaml logs --tail=100`
