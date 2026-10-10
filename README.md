# ScalePods Hiring SaaS

ScalePods is a recruiter-facing hiring product, from job creation through sending an offer. It uses Next.js for the web application, Supabase Auth/Postgres/Storage for identity and persisted data, and n8n for business workflow orchestration and external integrations.

The product has one authenticated recruiter per company workspace. Interviewers use secure links for calendar connection and feedback; they do not get a recruiter dashboard. Hiring jobs remain `campaigns` in the database for compatibility.

## Architecture

- `apps/web`: Next.js App Router application and same-origin server routes.
- `packages/core`: shared schemas and Supabase database types.
- `supabase/migrations`: canonical database source of truth; apply migrations in filename order.
- `n8n`: exported workflow definitions. Workflow exports must be imported, configured, and activated in the n8n instance separately.

The target boundary keeps Supabase Auth and private file upload in the web app, with business workflows orchestrated by n8n. Application intake is the first command moved behind that boundary: a Next.js route validates the recruiter JWT and calls n8n; n8n forwards the JWT to a migration-backed Supabase RPC, preserving `auth.uid()` and RLS. Other existing flows are still being migrated. Never expose a service-role key in browser code.

## Local setup

```bash
npm install
Copy-Item apps/web/.env.example apps/web/.env.local
npm run dev
```

The web app runs at `http://localhost:3000`. Set the Supabase project values, n8n base URL, and frontend URL in `apps/web/.env.local`. Do not commit environment files or real credentials.

## Supabase setup

Apply every migration under `supabase/migrations/` in lexical order (`0001` through the latest numbered migration). Migrations define the schema, RLS, constraints, and RPC contracts; do not make manual production schema changes outside checked-in migrations.

The application intake workflow requires migrations through `0016_n8n_application_intake.sql`. It calls `create_application_intake` with the authenticated recruiter JWT. The function derives the workspace from `auth.uid()`, checks the job is Open and its round sequence is configured, enforces the AI voice phone requirement, blocks same-job email duplicates, and stores the resume path/contact snapshot on the application.

## n8n setup

Import `n8n/14 - Application Intake v2.json` and `n8n/15 - Application Commands v2.json`, then create these n8n variables:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/publishable key |

Activate the workflows only after verifying those values and their production webhook URLs. They call database RPCs using the forwarded recruiter's JWT; Supabase validates the JWT and enforces workspace access through the RPCs and RLS. The endpoints are `POST /webhook/hiring/application-intake` and `POST /webhook/hiring/application-command`.

Older workflow exports remain in `n8n/` for existing behavior, but several still use the legacy candidate/round-instance and offer-letter contracts. Do not assume they are compatible with the new application schema. The SignWell offer flow is not yet wired to the recruiter-first signing contract; the old simulated web route must not be used as proof that an offer was sent.

## Useful commands

```bash
npm run dev
npm run typecheck
npm run lint
npm run test
```

This repository contains both the current Next.js app and `apps/legacy`; use `npm run dev` for the Next.js app. Tests are not run as part of implementation unless requested.

## Current implementation boundary

The application intake path is being migrated to the n8n gateway. Calendar booking, feedback, AI assessments, voice calls, notifications, retention purge, and SignWell offer sending still require workflow-by-workflow migration to the application-centric schema and agreed product behavior. Until then, the product is not production-ready.
