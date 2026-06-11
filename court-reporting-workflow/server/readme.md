# Getting Started

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Environment Variables

Create a `.env` file:

```env
PORT=3004

DB_HOST==your_host
DB_PORT=your_port
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=court_reporting_db

DATABASE_URL="postgresql://postgres:password@localhost:5432/court_reporting_db"

JWT_SECRET="your_secret"
```

## 3. Generate Prisma Client

```bash
npx prisma generate
```

## 4. Apply Existing Migrations

```bash
npx prisma migrate deploy
```

## 5. Seed Initial Data

```bash
npm run db:seed
```

## 6. Start Development Server

```bash
npm run dev
```

The API will be available at:

```text
http://localhost:3004
```

## 7. Run Tests

```bash
npm test
```

The service tests cover atomic reporter/editor claiming and version-guarded assignment updates.
