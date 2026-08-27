# SyncRoom

**Real-Time Collaborative Workspace**

Multiple users work inside the same shared document and see each other's changes instantly — no page refresh, no polling.

## Overview

A Socket.IO backend owns synchronization, presence, permissions and persistence; the React client is a thin view over a live event stream.

- Real-time document sync with optimistic updates
- User presence (online / editing / idle)
- Version-based conflict detection and persisted version history with restore
- Comments, mentions, notifications and activity feed
- Authenticated WebSockets with role-based authorization
- Reconnection handling with automatic state resync

**Stack:** React · TypeScript · Vite · Tailwind CSS · TipTap · Node.js · Express · Socket.IO · PostgreSQL · Prisma

## Quick Start

Requirements: Node 18+ (24 recommended), Docker (for PostgreSQL), npm.  

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL (port 5433)
npm run db:up

# 3. Configure environment
cp .env.example server/.env

# 4. Migrate + seed
npm run db:migrate
npm run db:seed

# 5. Run both servers (API :4100, client :5174)
npm run dev
```

Open **http://localhost:5174** and sign in as any demo user (password `password123`):

```
furqan@syncroom.dev   — Owner of "Customer Onboarding"
ahmed@syncroom.dev    — Editor
sarah@syncroom.dev    — Editor
```

**Demo:** open the *Customer Onboarding* workspace in two browsers (Furqan and Ahmed), edit the document in one and watch the other update instantly.

### Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://syncroom:syncroom@localhost:5433/syncroom` | PostgreSQL connection string |
| `JWT_SECRET` | — | Signs JWTs (use a long random string in production) |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `PORT` | `4100` | API + WebSocket port |
| `CLIENT_ORIGIN` | `http://localhost:5174` | CORS origin |

## REST API

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/register` · `/api/auth/login` | register / login (returns JWT) |
| `GET` / `POST` | `/api/workspaces` | list recent / create |
| `GET` / `PUT` / `DELETE` | `/api/workspaces/:id` | owner can update/delete |
| `GET` / `POST` | `/api/workspaces/:id/members` | list / invite by email |
| `PATCH` / `DELETE` | `/api/workspaces/:id/members/:userId` | change role / remove |
| `GET` / `POST` | `/api/workspaces/:id/documents` | list / create |
| `GET` / `PATCH` | `/api/documents/:id` | fetch / rename |
| `GET` | `/api/documents/:id/versions` | version history |
| `POST` | `/api/documents/:id/versions/:version/restore` | restore a version (creates a new one) |
| `GET` / `POST` | `/api/documents/:id/comments` | list / create |
| `PATCH` / `DELETE` | `/api/comments/:id` | edit / delete |
| `GET` | `/api/workspaces/:id/activity` | activity feed |
| `GET` | `/api/notifications` | list + unread count |
| `POST` | `/api/notifications/read-all` · `/api/notifications/:id/read` | mark read |
| `GET` | `/api/search?q=` | workspaces, documents, comments, activity |

Real-time events — workspace join/leave, presence, document updates, comments and notifications — are delivered over Socket.IO.

## Docker

`docker compose up --build` runs the full stack: PostgreSQL, server and client (nginx). Open **http://localhost:8080**.

For development, run only PostgreSQL in Docker (`npm run db:up`) and the apps with `npm run dev`.

## Testing

```bash
npm test          # server tests (requires Docker Postgres running)
```

The suite covers authentication, authorization, collaboration and reconnection over real HTTP + Socket.IO connections against a dedicated test database.

## Project Structure

```
syncroom/
├── client/                     # React + TypeScript + Tailwind + TipTap
│   └── src/
│       ├── components/         # editor, panels, modals, indicators
│       ├── pages/              # login, register, dashboard, workspace
│       ├── stores/             # zustand (document sync, presence, comments, …)
│       └── lib/                # api client, socket layer, formatting
├── server/                     # Node + Express + TypeScript + Prisma + Socket.IO
│   ├── prisma/                 # schema + seed data
│   ├── src/
│   │   ├── routes/             # REST endpoints
│   │   ├── services/           # business logic (incl. collaboration service)
│   │   ├── websocket/          # Socket.IO setup + event handlers
│   │   ├── presence/           # in-memory presence store
│   │   ├── middleware/         # auth, error handling
│   │   └── validation/         # zod schemas
│   └── test/                   # vitest + supertest + socket.io-client
└── docker-compose.yml          # postgres + server + client
```
