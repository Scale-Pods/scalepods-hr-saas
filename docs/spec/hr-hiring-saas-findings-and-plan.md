# HR Hiring SaaS: Findings and Implementation Plan

## Product scope

Build a hiring product covering job creation through sending an offer to the candidate. The product does not track candidate offer acceptance or onboarding.

Intended workflow:

**Create a job → configure its rounds → upload resumes → review and advance applications → run interviews and assessments → prepare an offer → recruiter signs → SignWell sends it to the candidate.**

## Agreed product decisions

### Workspace and access

- One authenticated recruiter per company workspace.
- Companies self-register with email and password; provide password reset. Email verification and MFA are out of scope for now.
- Interviewers do not get a dashboard. They use secure links for calendar connection and interview feedback.
- Supabase checked-in migrations are the source of truth; n8n handles integrations and background orchestration.
- Keep `campaigns` and `campaign_rounds` as database names; product UI may call them jobs and rounds.

### Jobs and rounds

- Job fields: title, description, status, location, work arrangement, opening date, closing date, number of openings, and optional salary range. Currency and pay period are set per job.
- Jobs start Open. Recruiters close them manually. Closing freezes the pipeline; opening/closing dates are informational.
- Resume uploads are allowed any time the job is Open. The job description locks after the first round is created; other job details lock after the first application exists.
- Recruiters configure the whole round sequence before the first application. Rounds are immutable once created, and the sequence locks once applications exist. Every application completes each round in order.
- Retention starts when a job closes. Reopening pauses the timer; closing again resumes the remaining time. The tier at first close fixes retention: Free 7 days, Basic 30, Growth 90, Enterprise 365.

### Candidates and applications

- Recruiters upload resumes; there is no public application form. Name, email, and resume are required; phone is required only for jobs with an AI voice round.
- Accept PDF/DOCX up to 10 MB. A resume belongs to one application and cannot be replaced. Block a normalized-email duplicate in the same job; likely duplicates by name/phone can be flagged for recruiter confirmation as a different person.
- Contact corrections are scoped to one application. A candidate can have applications across jobs. Deleting one application removes its own data; delete the candidate profile only after its last application is removed.
- Resume Screening is the first application stage. The system compares extracted resume text with the job description and records an advisory 1–100 score plus a short rationale. Only the recruiter’s explicit Advance action starts round 1; Reject is also explicit, and the AI never changes application state. Image-only/scanned resumes need OCR support and are rejected by the current text-extraction intake.

### Pipeline and decisions

- Provide Kanban (default) and table views. Only explicit Advance and Reject actions change stage; no drag/drop transitions.
- Hold preserves stage and pauses pending invitations/reminders. Existing booked interviews remain in place, and their reminders continue.
- Rejection requires recruiter confirmation, has an optional reason, is final, and notifies the candidate. Candidates cannot withdraw.
- Incomplete assessments become Incomplete for recruiter review. Incomplete interviews have no score. The recruiter may still decide Advance or Reject. Human feedback is required before a decision after a human interview. Interviewers report no-shows; recruiter can confirm rejection but cannot reschedule.
- Use 1–100 scores. Keep score types distinct and provide a combined average on the dashboard. Score filters never change application state.

### Interviews and assessments

- One interviewer per human interview round. Each interviewer securely connects their primary Google Calendar. If disconnected, preserve existing bookings but offer no new slots.
- Candidates can book any open slot in the configurable window (14 days by default), see local and interviewer/company time zones, and self-reschedule once. Interviewer cancellation notifies the candidate and permits another reschedule. Duration is configurable per round. Use Google Meet only.
- Feedback links expire one day after the interview. Feedback is structured, includes criteria and notes, is immutable after submission, and exposes prior feedback/AI scores to the interviewer.
- AI video/audio rounds record the session and require spoken answers. Show disclosure before recording; candidates can end the call. AI drafts questions and criteria from the job description for recruiter approval. Allow at most one follow-up per question. Show evidence with 1–100 scores.
- Assignments have per-round instructions and deadlines. Block submissions after the deadline with no extension/reopen. Missing submissions are Incomplete.
- AI voice rounds require phone. Schedule calls automatically inside a round time window in company timezone; attempt twice total. No answer or hangup becomes Incomplete for recruiter review. Start with disclosure; no invitation/reminder.

### Offers and communications

- Use company-provided SignWell templates through a shared ScalePods account; recruiters see only templates assigned to their company. SignWell configures fields. Fill known candidate/job values; recruiter supplies missing required values.
- Recruiter signs first using their account email; SignWell then sends to the candidate. An offer counts toward openings when sent. Warn at/over capacity and let recruiter continue; do not auto-close. One offer per application; no correction/resend after sending.
- Deleting an application cancels outstanding SignWell requests where possible. Already-sent offers continue to count toward openings.
- Send email to all candidates and WhatsApp only with phone plus recorded opt-in. No SMS. Use ScalePods branding, shared accounts, fixed templates, and recruiter email as reply-to. Advancing automatically sends the next-round invitation.
- Recruiters can toggle reminders per job. Timing customization is tier-limited; downgrades preserve schedules but lock editing.

### Reporting, retention, and exclusions

- Keep existing metrics. Rename “Hired This Quarter” to “Offers Sent This Quarter,” “Time-to-Hire” to “Time-to-Offer” (application creation to candidate offer send), and “Decision Quality” to “Evaluation Signal Rate” (required evaluations completed with score).
- Keep pipeline funnel/conversion and candidate locations (resume extraction or Unknown). Source effectiveness stays “Not tracked” until source capture exists.
- No CSV export, document download, or per-application audit timeline for now.
- Closed jobs are read-only, including deletion. Reopen to delete an application, then close again. Immediate deletion while Open requires confirmation and removes application data; preserve candidate profile if other applications remain. Retain capacity events. Purge cancels outstanding SignWell requests and removes retained data/recordings.
- Billing integration, Stripe, offer acceptance tracking, onboarding, SMS, and in-person interviews are out of scope.

## Codebase findings from the prior review

The earlier review identified a Next.js 15.5.25 application in `apps/web`, shared core in `packages/core`, 10 original Supabase migrations, and 13 legacy n8n workflow exports.

- Root README appears stale: it describes Vite and omits workflows.
- Database has no first-class application model. Resume is on candidate records and pipeline state is inferred from round instances.
- Some app types/queries do not match migrations. The app expects decision-ledger fields such as `round_instance_id`, `weight`, `raw_text`, and `created_at` that were absent in the reviewed schema.
- Migration `0009` refers to `accounts.email`, which migration `0001` did not appear to create.
- n8n workflows depend on tables/views/functions that appear absent, including assignments, bookings, OAuth states, offers, notification templates, and reporting objects.
- Workflow 10 was noted to store calendar tokens in plaintext. Workflow 12 contains a Stripe signature TODO; billing is deferred.
- UI uses legacy `on`/`off`/`paused` statuses, cutoff scores, SMS, and pipeline state derived from round instances. Some dashboard data/visuals appear simulated.

## Work already started (unverified)

The prior work session added `docs/spec/hiring-product-requirements.md` and forward migrations `0011`–`0015` for applications, job fields, round/assessment/offer contracts, interviewer calendar/feedback, and application actions/outbox. These were not executed against a database.

## Implementation update (2026-10-09)

- Added migration `0016_n8n_application_intake.sql` with an authenticated, RLS-scoped application intake RPC.
- Added migration `0017_confirmed_application_rejection.sql`; the authenticated decision RPC now requires an explicit rejection confirmation.
- Added `n8n/14 - Application Intake v2.json` and `n8n/15 - Application Commands v2.json`. They require `SUPABASE_URL` and `SUPABASE_ANON_KEY`; authenticated recruiter JWTs are forwarded to Supabase for authorization.
- Resume intake and application decision/contact commands now pass through authenticated Next.js gateway routes into those n8n workflows. The UI no longer fires the old duplicate candidate-intake flow after creating an application.
- Resume selection now rejects non-PDF/DOCX files and files over 10 MB. The migration verifies resume paths are scoped to the authenticated account and selected job.
- The old offer API simulated a SignWell document and marked it sent. It now fails closed with a clear `503` until recruiter-first SignWell sending is implemented in n8n.
- `npm run typecheck` succeeds, and the two new workflow exports parse as JSON. No tests were run and migrations/workflows were not applied to Supabase or a live n8n instance.
- Other existing campaign writes, resume AI scoring, notification/outbox dispatch, calendar/assessment/voice workflows, retention purge, and the real SignWell offer flow remain to be migrated. The system is still not production-ready.

## Implementation plan

### Phase 1: Establish a reliable baseline

1. Restore workspace access and inspect `git status` and all repository instructions.
2. Re-read all migrations, application code, and all 13 legacy n8n exports; manually review migrations `0011`–`0016` for syntax, compatibility, constraints, triggers, RLS, grants, and security-definer behavior.
3. Map every workflow table/function/credential dependency to migrations and application code; record discrepancies.
4. Correct README and product specification.

**Deliverable:** verified architecture and gap report; reconciled migration plan.

### Phase 2: Make migrations the product contract

1. Model applications explicitly, with application-scoped contact/resume data and global candidate identity.
2. Implement job lifecycle, retention snapshot/countdown, round immutability, sequence locking, and closed-job read-only behavior.
3. Add round types, assignment submissions, score records, calendar bookings, feedback, offers, capacity events, and durable outbox work.
4. Define RLS/grants and narrow RPCs for stage decisions, scoring, offers, and external actions.
5. Implement deletion/purge semantics, orphan candidate cleanup, SignWell cancellation work, and permanent capacity accounting for sent offers.
6. Ensure every n8n dependency exists and sensitive credentials are stored safely.

**Deliverable:** coherent schema recreatable from an empty database using checked-in migrations.

### Phase 3: Align application APIs and n8n

1. Align shared types with migration schema.
2. Refactor APIs/server actions to use applications directly, not derive them from round instances.
3. Define idempotent webhook/RPC contracts and durable event processing for n8n.
4. Remove deferred Stripe, SMS, and offer acceptance flows; resolve missing workflow dependencies.
5. Secure Google OAuth, feedback links, and webhook authentication; use expiring, purpose-bound credentials.

**Deliverable:** app, database, and workflows use the same entities and transitions.

### Phase 4: Build recruiter workflows

1. Workspace signup/login/password reset.
2. Job creation, close/reopen/retention, and round configuration.
3. Resume upload, duplicate handling, parsing, and review.
4. Kanban/table pipeline, explicit decisions, hold, rejection confirmation, and opening-capacity warnings.
5. Scheduling, interviewer feedback, assignments, recorded AI interviews, and AI voice calls.
6. SignWell offers with recruiter-first signing and capacity events.
7. Communications, reminders, tier gates, and dashboard metrics.

**Deliverable:** coherent end-to-end hiring flow through offer sending, including incomplete/review paths.

### Phase 5: Production readiness

1. When verification is requested, add/run migration, API, integration, and workflow checks.
2. Verify workspace isolation and RLS with non-owner contexts.
3. Verify idempotency/retries for upload, scheduling, calls, notifications, feedback, SignWell callbacks, deletion, and purge.
4. Review personal data/audio retention, consent disclosure, OAuth secrets, link expiry, and webhook authentication.
5. Document deployment, environment variables, n8n configuration, recovery, and operations.

**Deliverable:** evidence-backed release checklist and deployment procedure. The product assumption of “no failures for now” does not remove the need for safe implementation behavior.

## Immediate next step

Restore the workspace command runner, then revalidate repository state and review the unverified migrations/workflows before building UI features on top of them.
