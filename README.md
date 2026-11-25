# Vidipo Backend

The backend API for **Vidipo**, a social networking platform built with NestJS, TypeScript, and Prisma.

## Features

- OTP authentication and JWT authorization
- User profiles and social relationships
- Posts, comments, likes, and reactions
- Stories and short-form videos (Reels)
- Real-time messaging with Socket.IO
- Subscription plans and payment integration
- Administration and user management
- Object storage using RustFS

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

Docker deployment:
- Docker Engine
- Docker Compose v2
- Git

Local development:
- Node.js 20
- npm
- PostgreSQL
- Redis
- RustFS or compatible object storage

## Docker Installation

Clone the repository:

    git clone https://github.com/aref-d23/vidipo-backend.git
    cd vidipo-backend

Create the environment file:

    cp .env.example .env.production

Edit `.env.production` and replace all placeholders with valid configuration. Use strong, unique secrets. Never commit this file.

Start infrastructure:

    docker compose up -d postgres redis minio

Build the API:

    docker compose build api

Apply database migrations:

    docker compose run --rm api npx prisma migrate deploy

Create or update the initial subscription plans:

    docker compose run --rm api npm run seed

Start the API:

    docker compose up -d api

The default API address is:

    http://localhost:3000/api

## Local Development

Install dependencies:

    npm ci

Create a local environment file:

    cp .env.example .env

Configure valid database, Redis, storage, and authentication settings.

Generate Prisma Client:

    npm run prisma:generate

Apply development migrations:

    npm run prisma:migrate

Optionally seed the initial subscription plans:

    npm run seed

Start the development server:

    npm run start:dev

Build and run the production application:

    npm run build
    npm run start:prod

## Useful Commands

| Command | Description |
|---|---|
| `npm run build` | Build the application |
| `npm run start:dev` | Start in watch mode |
| `npm run start:prod` | Start compiled application |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:migrate` | Run development migrations |
| `npm run prisma:deploy` | Apply production migrations |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run seed` | Seed initial subscription plans |

## Docker Services

| Service | Purpose |
|---|---|
| `api` | NestJS backend |
| `postgres` | PostgreSQL database |
| `redis` | Redis cache |
| `minio` | RustFS object storage |

PostgreSQL and object storage data are persisted using Docker volumes.

## API Modules

All HTTP endpoints use the `/api` prefix.

| Module | Description |
|---|---|
| auth | Authentication and account access |
| users | User profiles and social relationships |
| posts | Posts, comments, and reactions |
| stories | Stories and interactions |
| chat | Conversations and messaging |
| subscription | Plans and payments |
| admin | Administrative operations |
| uploads | File uploads |

Real-time communication is provided through Socket.IO gateways.

## Database and Migrations

The Prisma schema is located at `prisma/schema.prisma`.

Migration history is maintained in `prisma/migrations/` and must be committed to version control.

Do not modify migrations that have already been applied to production. Create new migrations for subsequent schema changes.

## Environment Variables

The `.env.example` file documents the available environment variables.

- Local development uses `.env`.
- Docker Compose uses `.env.production`.

Never commit environment files containing real credentials, private keys, or production data.

## Security

- Use strong and unique JWT and encryption secrets.
- Never publish production credentials or database backups.
- Keep PostgreSQL and Redis on private networks.
- Configure trusted CORS origins.
- Use HTTPS in production.
- Restrict object storage access.
- Back up databases and persistent storage regularly.
- Keep dependencies and runtime images updated.

## Contributing

Contributions, bug reports, and suggestions are welcome.

1. Create a branch for your changes.
2. Keep changes focused and document relevant behavior.
3. Run the build and validate migrations where applicable.
4. Submit a pull request describing your changes.

Do not include secrets, production data, or private user information in issues or pull requests.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
