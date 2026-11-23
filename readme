# EventSync

**A group scheduling application designed to make finding the right meeting time easier.**

EventSync is a web application that helps users coordinate meetings and events by comparing everyone's availability and recommending the most convenient times. Whether it's for businesses, universities, or groups of friends, EventSync aims to eliminate the back-and-forth that often comes with scheduling around multiple people.

Users can manually manage their availability, connect their Microsoft Outlook calendars, create groups, and organize events through a single interface.

## Features

- **Smart Scheduling:** Compares participant availability and recommends meeting times based on the greatest overlap.
- **Calendar Management:** Allows users to manually add, remove, and adjust their available hours.
- **Microsoft Outlook Integration:** Uses Microsoft Graph API to import calendar events and identify scheduling conflicts.
- **Group Management:** Create groups, invite members, and organize events with multiple participants.
- **Friend System:** Send, accept, and manage friend requests.
- **Event Creation:** Create meetings, invite participants, collect availability, and finalize event times.
- **Notifications:** Receive updates about invitations, friend requests, and event changes.
- **Persistent Storage:** Stores accounts, events, groups, and schedules in MySQL so information remains available between sessions.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | Java 21, Spring Boot, REST API |
| Database | MySQL 8.4 |
| Calendar Integration | Microsoft Graph API, OAuth 2.0 |
| Database Migrations | Flyway |
| Deployment | Docker, Docker Compose, Caddy |
| Development Environment | Figma Make, GitHub |

## How It Works

EventSync uses a three-layer architecture to separate the user interface, application logic, and permanent data storage.

### Frontend

The frontend provides the interface where users create events, manage friends and groups, submit availability, and view recommended meeting times.

Built with React and TypeScript, the interface communicates with the Java backend through REST API requests.

### Java Backend

The Java backend handles authentication, event management, calendar synchronization, and scheduling calculations.

When users submit their availability, Java retrieves the necessary information from MySQL, compares schedules, and ranks potential meeting times based on participant availability.

### MySQL Database

MySQL provides permanent storage for user accounts, groups, events, invitations, availability, and imported Outlook calendar information.

The database uses relational tables with primary and foreign keys to maintain consistency between records.

## Scheduling Algorithm

EventSync determines recommended meeting times through the following process:

1. Retrieve participant availability from MySQL.
2. Combine manually entered schedules with imported Outlook calendar information.
3. Apply manual availability overrides and identify conflicting time periods.
4. Generate potential meeting times based on the event's scheduling requirements.
5. Count how many participants are available for each option.
6. Rank the results and display the strongest matches.

For example, if five participants are organizing a meeting and a particular time works for all five, EventSync will rank that option above another time that only works for three.

Organizers can then select and finalize their preferred meeting time.

## Microsoft Outlook Integration

EventSync supports Microsoft Outlook calendar imports through the Microsoft Graph API.

Users can authorize EventSync to retrieve their calendar information using Microsoft's OAuth 2.0 authentication process. Imported busy periods are stored separately from manually entered availability, allowing users to adjust their schedules without modifying their original Outlook calendar.

Calendar synchronization is currently initiated by the user rather than performed continuously in the background.

## Running EventSync

### Requirements

- Docker Engine
- Docker Compose
- Node.js and npm for frontend development
- Microsoft Entra application credentials for optional Outlook integration

### Backend Setup

Clone the repository:

```bash
git clone https://github.com/YOUR-USERNAME/EventSync.git
cd EventSync
```

Create an environment configuration:

```bash
cp .env.example .env
```

Configure the database passwords, encryption key, and other required environment variables.

Start the Java backend and MySQL:

```bash
docker compose \
  -f compose.yaml \
  -f compose.prebuilt.yaml \
  -f compose.figma.dev.yaml \
  up -d --build
```

Verify that the backend is connected to MySQL:

```bash
curl http://localhost:8080/api/health
```

### Frontend Setup

```bash
cd figma-source
npm install
npm run dev
```

The development frontend runs at:

`http://localhost:8443`

The frontend forwards API requests to the Java backend, which communicates with MySQL.

## Project Status

**Active Development**

EventSync is being developed as an Information Systems capstone project.

The current project includes a React frontend, Java backend, relational MySQL database, scheduling logic, user accounts, group management, and Microsoft Outlook integration.

The application is currently undergoing integration testing and further improvements. Some features may be incomplete or subject to change.

## Future Improvements

- Automatic Outlook calendar synchronization
- Additional calendar providers, including Google Calendar
- Public event discovery through third-party APIs
- Improved friend request and notification interfaces
- Outlook and Teams meeting creation
- Expanded organization management and administrator features
- Mobile-friendly improvements

## Project Purpose

EventSync was created to address a common scheduling problem: finding a time that works for everyone.

Rather than requiring participants to repeatedly communicate their availability, EventSync centralizes scheduling information and compares it automatically.

The goal is to provide a convenient scheduling solution that is useful for both professional organizations and smaller personal groups.

## Contributors

- Aaron Josh Orig
- Daniel Quintero
- Hung-Nhan Michael Pham
- Jessica Albiter
- Kowsar Farah

**INSY 4325 — Information Systems Capstone Project**
