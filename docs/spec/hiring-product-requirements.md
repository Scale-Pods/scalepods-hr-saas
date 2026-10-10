# ScalePods Hiring Product Requirements

Working product decisions recorded on 2026-10-09. The product covers hiring from job creation through sending an offer to a candidate. This file is the behavioral baseline for the schema and workflow rebuild.

## Product and account model

- One authenticated recruiter account per company. Companies self-register with email and password, may reset passwords, and do not need email verification or MFA in the initial release.
- Workspace setup requires a company name and time zone. New workspaces start on Free; ScalePods assigns higher tiers manually until billing is implemented.
- Interviewers are non-account contacts. They have no dashboard; they use secure links to connect their own Google Calendar and submit assigned feedback.
- Supabase migrations are the source of truth for persistent data and access control. The app owns the recruiter and candidate UX. n8n orchestrates integrations and background work against explicit contracts.
- Keep the database names `campaigns` and `campaign_rounds`; user-facing copy may call them jobs and rounds.

## Jobs and pipelines

- A job has a title, description, Open/Closed status, location, work arrangement, opening date, closing date, number of openings, and optional salary range. Currency and pay period are set per job.
- New jobs start Open. Both dates are required, but dates do not change status: uploads are allowed whenever the recruiter has left the job Open, and the recruiter manually closes it.
- Closing freezes hiring actions and starts the retention timer. Closed jobs are read-only. A recruiter may reopen before purge; the timer pauses while open and resumes with the remaining duration when closed again.
- The job description locks when the first round is created. Other job details lock when the first application is added. If a detail must change after that, the recruiter closes the job and creates another.
- The recruiter must configure the full round sequence before uploading applications. Rounds are ordered and immutable from creation; no round can be edited or deleted after creation. Once applications exist, no round can be added. Every application completes every round in order.
- Round cutoffs and automatic advancement/rejection are removed. The recruiter explicitly chooses Advance, Reject, or Hold. Kanban is the default application view; a table view is also available. Dragging cards never changes state.

## Candidate intake and application records

- Recruiters upload resumes; there is no public application portal. Name, email, and resume are required. Phone is optional except on jobs with an AI voice round, where it is required. WhatsApp permission is captured during intake.
- Accept PDF and DOCX, up to 10 MB. A resume belongs to one application and cannot be replaced. Recruiters can correct name, email, and phone on that application without changing the candidate’s other applications.
- A candidate may apply to multiple jobs. The same candidate/job pair cannot be uploaded twice. Exact normalized-email duplicates within a job are blocked; likely matches by name or phone warn and may continue after the recruiter confirms they are different people.
- An application owns its resume, contact snapshot, current status/stage, round instances, evaluations, communications, and offer. Deleting an application preserves a shared candidate profile if other applications still use it; deleting the last application deletes the remaining profile.
- Resume Screening is the first application stage. The system compares extracted resume text with the job description and records an advisory 1–100 score plus a short evidence-based rationale. The recruiter explicitly chooses Advance or Reject; only Advance creates round 1. The score never advances or rejects an application automatically. Score thresholds only filter/select records and never change state.
- Resume text must be extractable for automated screening in the initial implementation. Scanned/image-only files need OCR support before they can enter the scored intake flow.

## Application states and decisions

- Rejection is final. It requires confirmation, sends a candidate notification, and may include an optional predefined reason; no written reason is required. A candidate cannot withdraw.
- Hold preserves the underlying stage and pauses pending invitations/reminders. An existing interview stays booked and its interview reminders continue.
- Incomplete assessments remain for recruiter review. No incomplete interview receives a score. The recruiter decides whether to Advance or Reject based on the available material.
- No-show is reported by the assigned interviewer. For a missed human interview, the recruiter can only confirm rejection; there is no automatic reschedule path.
- Human interview feedback is required before the recruiter can decide the post-interview outcome. Feedback links expire one day after the interview. Interviewers submit recruiter-defined criteria on a 1–100 scale and notes; submitted feedback is locked. Interviewers can see prior feedback and AI scores before submitting.

## Round types

### Human interview

- One interviewer per round. The interviewer connects their primary Google Calendar through secure OAuth; only that calendar is checked for availability. Disconnecting preserves existing bookings and stops new slot offers until reconnection.
- Candidates choose any open slot in a per-round booking window (14-day default), with no minimum notice. Show times in the candidate’s local zone and the interviewer/company zone. The recruiter can arrange a time manually if no slot works.
- Booking automatically creates a Google Meet event/link. In-person and external meeting links are out of scope.
- Candidates may self-reschedule once. Interviewer cancellation notifies the candidate and grants a fresh reschedule, even if the candidate already used their one. Further candidate-initiated changes are handled by the recruiter.

### AI interview

- Record audio/video and require spoken answers. Assume all candidates consent; display the disclosure before recording. Proctoring events are contextual only and never change scores or decisions.
- Draft core questions and evaluation criteria from the job description. The recruiter approves both before the round is created. The AI may ask at most one follow-up per core question.
- Score each criterion on 1–100 and show answer evidence. An incomplete interview has no score but remains reviewable.

### Take-home assignment

- The recruiter configures the instructions and deadline in the round. Submissions after the deadline are blocked; the deadline cannot be extended or reopened.
- AI evaluates submissions against criteria drafted from the job description and assignment instructions and approved by the recruiter. Scores use 1–100. No submission by the deadline becomes Incomplete for recruiter review.

### AI voice screening

- Draft questions and evaluation criteria from the job description for recruiter approval. Use one 1–100 score with evidence, consistent with other scored assessments.
- The system chooses when to call within the round’s configured window, using the company time zone. It makes two attempts total if the candidate does not answer. No invitation or reminder is sent; the call starts with the AI/recording/transcription disclosure and proceeds. If the candidate hangs up or does not answer both attempts, mark Incomplete for recruiter review.

## Scores and reporting

- Every scored assessment uses 1–100. Application detail keeps resume, voice, AI interview, assignment, and human feedback scores separate. Score filters apply per assessment type.
- Preserve current metric coverage: candidate counts, average score, active jobs, offers this quarter, evaluation signal rate, pipeline funnel/conversion, candidate locations, source effectiveness, time-to-offer, and AI/round usage.
- Rename “Hired This Quarter” to “Offers Sent This Quarter” and “Time-to-Hire” to “Time-to-Offer”. Time-to-Offer measures from application creation until SignWell sends the offer to the candidate.
- “Evaluation Signal Rate” is the share of required evaluations completed with a score. Candidate locations use resume-extracted location, or Unknown. No source field is collected initially; source effectiveness displays Not tracked until source data exists.
- No CSV export or document download in the initial product. No per-application audit timeline in the initial product.

## Communications, offers, and capacity

- Email is sent for all applicable candidate communications. WhatsApp is used only when a phone number and recorded opt-in are present. SMS is out of scope. Shared ScalePods email and WhatsApp services use ScalePods branding and fixed templates; email replies go to the recruiter’s account email.
- Advancing automatically sends the next-round invitation. Confirmed rejection sends its template. AI voice rounds skip invitation/reminder messages. Recruiters may customize reminder timing and turn individual reminders on/off per job according to tier entitlements.
- Offers use company-provided SignWell templates in a shared ScalePods SignWell account. Recruiters see only templates assigned to their company. Template fields are configured in SignWell; ScalePods fills known candidate/job values and prompts for remaining required values.
- The recruiter’s account email signs first; SignWell then sends to the candidate. An opening counts only once the recruiter signs and SignWell sends the request to the candidate. If offer count reaches or exceeds openings, warn the recruiter but allow sending. Do not auto-close the job.
- The product ends at sending the offer; it does not track candidate signature or acceptance. An offer cannot be corrected or resent after it is sent.

## Deletion and retention

- Recruiters may immediately delete an application while its job is Open, with confirmation. Deletion removes application-specific data and cancels an outstanding SignWell request where possible. If an offer was already sent, it continues to count toward openings.
- Closed jobs are read-only, including application deletion. To delete from a Closed job, reopen it, delete the application, and close it again.
- Retention starts when a job is closed, using the workspace tier at that moment: Free 7 days, Basic 30 days, Growth 90 days, Enterprise 365 days. A closed job keeps that duration if the workspace tier changes. Reopening pauses the timer; re-closing resumes the remaining time, not a new full period.
- Purge removes all job/application data, recordings, and outstanding SignWell requests where possible. A candidate profile remains only while another application still needs it.

## Deferred scope

- Stripe checkout, invoices, and subscription management are deferred. Tier entitlements remain internal and are assigned manually.
- No employee HRIS, payroll, onboarding, candidate self-application/withdrawal, SMS, in-person interviews, offer acceptance tracking, or exports/downloads.

## Current implementation gaps

- The checked-in schema has no `applications` table and stores `resume_url` on `candidates`; round instances and decisions are keyed to candidate/job instead of application.
- The base job status is `on/off`; there is no campaign close date, location, work arrangement, openings, salary, or company time zone model. Round cutoffs remain in SQL and types; the base round constraint omits AI voice.
- App types and migrations diverge (for example, app selects ledger fields that the migration does not define). Migration 0009 references `accounts.email`, which earlier migrations do not add.
- n8n exports reference missing tables/views/functions and divergent names (including `assignments` vs `assignment_submissions`, booking/OAuth/offer entities, and reporting views). Contracts need to be reconciled against the migrations.
- Calendar token handling in an exported workflow is described as plaintext; the calendar flow must use secure OAuth and encrypted credential storage. The Stripe webhook has signature-verification TODOs; billing workflows are deferred.
- Existing UI and workflow behavior includes cutoff logic, automatic decisions, SMS, and post-round features outside this product scope. The root README describes Vite and says workflows are absent, though the app is Next.js and the workflow exports are checked in.
