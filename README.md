# Vidipo Backend

The backend API for Vidipo, a social networking platform built with NestJS and TypeScript.

## Features

- OTP and JWT authentication
- User profiles and social relationships
- Posts, comments, likes, and reactions
- Stories and short-form videos (Reels)
- Real-time messaging with Socket.IO
- Subscription plans and payment integration
- Administration and user management
- File storage using RustFS

## Technology Stack

- Node.js 20
- NestJS 10
- TypeScript
- Prisma ORM
- PostgreSQL 16
- Redis 7
- RustFS
- Socket.IO
- Docker Compose

## Requirements

- Docker Engine
- Docker Compose v2
- Git

## Installation

Clone the repository:

    git clone https://github.com/aref-d23/vidipo-backend.git
    cd vidipo-backend

Configure environment variables:

    cp .env.example .env.production

Replace all CHANGE_ME placeholders with secure values. Never commit production credentials.

Start infrastructure:

    docker compose up -d postgres redis minio

Build the API:

    docker compose build api

Apply database migrations:

    docker compose run --rm api npx prisma migrate deploy

Start the API:

    docker compose up -d api

The default API address is http://localhost:3000/api

## API Modules

All HTTP endpoints use the /api prefix.

| Module | Description |
|---|---|
| auth | Authentication and account access |
| users | Profiles and social relationships |
| posts | Posts, comments, and reactions |
| stories | Stories and interactions |
| chat | Conversations and messaging |
| subscription | Plans and payments |
| admin | Administrative operations |
| uploads | File uploads |

Real-time communication is provided through Socket.IO gateways.

## Database

Prisma manages the database schema and migration history.

Useful commands:

    npx prisma validate
    npx prisma generate
    npx prisma migrate deploy

Migration history is maintained in prisma/migrations/ and must be committed to version control.

## Development

    npm ci
    npx prisma generate
    npm run start:dev
    npm run build

## Docker Services

| Service | Purpose |
|---|---|
| api | NestJS backend |
| postgres | PostgreSQL database |
| redis | Redis cache |
| minio | RustFS object storage |

PostgreSQL and object storage data are persisted using Docker volumes.

## Security

- Never publish production credentials.
- Use strong and unique secrets.
- Keep database and Redis services on private networks.
- Configure trusted CORS origins in production.
- Use HTTPS in production.
- Back up databases and persistent storage regularly.

## License

This project is licensed under the MIT License. See the LICENSE file.
