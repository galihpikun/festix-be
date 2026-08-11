# Festix Backend

Festix Backend is the server-side application for a ticket booking platform. This project is built to support booking tickets for events such as concerts, seminars, workshops, and other public activities.

The goal of this backend is to provide a solid foundation for managing users, events, and ticket booking flows in a scalable and maintainable way using NestJS and Prisma.

## What this project is about

This backend is designed for a ticket booking application where users can:

- browse or manage events
- book tickets for concerts, seminars, and other events
- handle user authentication and account-related flows
- connect to a PostgreSQL database through Prisma

At the moment, the project is being set up as a backend foundation for the Festix ticket booking system.

## Tech stack

This project uses:

- Node.js
- NestJS for the backend framework
- TypeScript
- Prisma ORM
- PostgreSQL database
- Express
- dotenv for environment variables
- Jest for testing
- ESLint and Prettier for code quality

## Packages installed

### Main dependencies

- @nestjs/common
- @nestjs/core
- @nestjs/platform-express
- @prisma/adapter-pg
- @prisma/client
- dotenv
- pg
- reflect-metadata
- rxjs

### Development dependencies

- @nestjs/cli
- @nestjs/schematics
- @nestjs/testing
- @types/express
- @types/jest
- @types/node
- @types/pg
- @types/supertest
- eslint
- eslint-config-prettier
- eslint-plugin-prettier
- jest
- prettier
- prisma
- ts-jest
- ts-node
- tsconfig-paths
- typescript
- typescript-eslint

## Project structure

- src/ - main NestJS application source code
- prisma/ - Prisma schema and database setup files
- generated/prisma/ - generated Prisma client
- test/ - end-to-end and test-related files

## Environment setup

Create a .env file in the project root and set your database connection string:

```bash
DATABASE_URL=your_postgres_connection_string
```

## Installation

Install all project dependencies:

```bash
npm install
```

## Database setup

Generate the Prisma client and prepare the database:

```bash
npx prisma generate
npx prisma migrate dev
```

## Run the project

### Development mode

```bash
npm run start:dev
```

### Production mode

```bash
npm run build
npm run start:prod
```

## Run tests

```bash
npm run test
npm run test:e2e
```

## Available scripts

- npm run start - start the app
- npm run start:dev - start in watch mode
- npm run start:debug - start in debug mode
- npm run build - build the project
- npm run test - run unit tests
- npm run test:e2e - run e2e tests

## Notes

This repository is currently being prepared as the backend foundation for a Festix ticket booking application. The Prisma schema is already connected to PostgreSQL, and the project structure is ready for adding features such as events, bookings, tickets, and user management.

## License

This project is currently unlicensed.