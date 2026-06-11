# Court Reporting Workflow Client

Next.js + TypeScript frontend for the court reporting workflow API.

## Setup

```bash
npm install
npm run dev
```

The client runs on `http://localhost:3000` and calls the API at:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3004/api
```

Copy `.env.example` to `.env.local` if you need to point at a different API URL.

Default seeded admin login:

```text
admin@app.com
password123
```

Seeded reporter/editor logins use the same password:

```text
rep1@app.com / password123
rep2@app.com / password123
rep3@app.com / password123
rep4@app.com / password123
rep5@app.com / password123

edit1@app.com / password123
edit2@app.com / password123
edit3@app.com / password123
```

## Screens

- Login gate for protected API calls
- Role-aware dashboard with job status, assignments, and payout estimates
- Create job dialog
- Assign reporter and assign editor dialogs
- Status and payment actions from the job table
- Admin staff availability table for reporters and editors
- Socket.IO listener for backend `jobUpdated` events, shown by the dashboard `Live` indicator

## Role Behavior

- Admin can create jobs, assign reporters/editors, process payments, and see reporter/editor availability.
- Reporter sees assigned jobs and can mark an assigned job as transcribed.
- Editor sees assigned review jobs and can mark a job as reviewed.
- Admin sees total per-job payout. Reporters and editors see their own per-job earnings.
- Reporters become available again after marking a job transcribed.
- Editors become available again after marking a job reviewed.

Status updates send the job `version` with the request. The backend checks that version before updating so two users cannot safely apply conflicting updates from stale job data.

## Payment Rules

- Reporter earnings: `duration x 2000 IDR`
- Editor earnings: `50000 IDR` flat fee per reviewed job
- Admin payout view: reporter earnings plus editor earnings for each job
