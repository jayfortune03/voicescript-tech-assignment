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

## API Reference

Base URL:

```text
http://localhost:3004/api
```

Protected routes require:

```http
Authorization: Bearer <jwt>
```

### Auth

#### `POST /auth/login`

Logs in a seeded user and returns a JWT.

Request:

```json
{
  "email": "admin@app.com",
  "password": "password123"
}
```

Response:

```json
{
  "token": "jwt-token",
  "user": {
    "id": "user-id",
    "name": "System Admin",
    "email": "admin@app.com",
    "role": "ADMIN"
  }
}
```

### Jobs

#### `GET /jobs`

Returns jobs ordered by newest first.

Query parameters:

```text
status=NEW | ASSIGNED | TRANSCRIBED | IN_REVIEW | REVIEWED | COMPLETED
```

Roles:
- `ADMIN`, `REPORTER`, `EDITOR`

#### `POST /jobs`

Creates a job. This route is intentionally open for the simplified assessment flow.

Request:

```json
{
  "caseName": "State v. Example",
  "duration": 60,
  "locationType": "PHYSICAL",
  "city": "Jakarta"
}
```

Rules:
- `duration` must be positive.
- `locationType` must be `PHYSICAL` or `REMOTE`.
- `city` is required for physical jobs and optional for remote jobs.
- New jobs start with `status = NEW` and `version = 1`.

#### `POST /jobs/:jobId/assign-reporter`

Assigns an available reporter to a `NEW` job.

Roles:
- `ADMIN`

Request:

```json
{
  "reporterId": "reporter-user-id",
  "version": 1
}
```

Rules:
- Physical jobs prefer same-city reporters in the frontend, but remote assignment remains allowed.
- The backend atomically claims the reporter row with `isAvailable = true`.
- The job update is guarded by `status = NEW` and the submitted `version`.
- Stale or competing updates return a conflict instead of double-assigning.

#### `POST /jobs/:jobId/assign-editor`

Assigns an available editor after transcription.

Roles:
- `ADMIN`

Request:

```json
{
  "editorId": "editor-user-id",
  "version": 3
}
```

Rules:
- Job must be `TRANSCRIBED`.
- The backend atomically claims the editor row with `isAvailable = true`.
- The job update is guarded by `status = TRANSCRIBED` and the submitted `version`.
- Successful assignment moves the job to `IN_REVIEW`.

#### `PATCH /jobs/:jobId/status`

Moves a job through the workflow.

Roles:
- `ADMIN`
- Assigned `REPORTER`
- Assigned `EDITOR`

Request:

```json
{
  "status": "TRANSCRIBED",
  "version": 2
}
```

Allowed transitions:

```text
ASSIGNED -> TRANSCRIBED
IN_REVIEW -> REVIEWED
```

Rules:
- Reporters can only mark their own assigned jobs as `TRANSCRIBED`.
- Editors can only mark their own review jobs as `REVIEWED`.
- Admin can perform valid transitions.
- Status updates use optimistic versioning to prevent stale updates.
- Reporters become available after `TRANSCRIBED`.
- Editors become available after `REVIEWED`.

#### `POST /jobs/:jobId/pay`

Calculates and stores payment rows, then completes the job.

Roles:
- `ADMIN`

Rules:
- Job must be `REVIEWED`.
- Reporter payment is `duration * 2000 IDR`.
- Editor payment is `50000 IDR`.
- Payment is idempotent at the workflow level: the transaction first changes `REVIEWED -> COMPLETED`, then inserts payment rows. A duplicate payment request fails before inserting duplicate payments.

### Users

#### `GET /users`

Returns staff users for assignment and availability display.

Roles:
- `ADMIN`

Query parameters:

```text
role=REPORTER | EDITOR
```

Response item:

```json
{
  "id": "user-id",
  "name": "Reporter A",
  "email": "rep1@app.com",
  "role": "REPORTER",
  "city": "Tangerang",
  "isAvailable": true
}
```

## Realtime Events

The server emits Socket.IO events from the HTTP server root:

```text
http://localhost:3004
```

Event:

```text
jobUpdated
```

Example payload:

```json
{
  "action": "STATUS_UPDATED",
  "job": {
    "id": "job-id",
    "status": "REVIEWED"
  }
}
```

The frontend listens for this event and refreshes job/staff data through TanStack Query.
