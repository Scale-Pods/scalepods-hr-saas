# n8n Backend Contract

## Boundary

- The web app handles screens, Supabase Auth, and direct upload of the selected resume into the private `resumes` bucket.
- A Next.js server route authenticates the recruiter and acts as a narrow gateway to n8n.
- n8n runs business workflows and calls Supabase RPCs with the recruiter's JWT. Supabase migrations and RLS remain the data contract and authorization boundary.
- Never send a Supabase service-role key to the browser or pass an unverified client-supplied `account_id` as authority.

## Application intake v2

Webhook: `POST /webhook/hiring/application-intake`

Required headers:

- `Authorization: Bearer <recruiter Supabase JWT>`

Body: `campaign_id`, `candidate_name`, `candidate_email`, optional `candidate_phone`, `resume_path`, and optional `whatsapp_opt_in`.

The Next.js server route authenticates the recruiter before calling n8n. The n8n workflow calls `create_application_intake` using the forwarded recruiter JWT and the Supabase anon key. The SQL function derives the workspace from `auth.uid()`, verifies ownership, Open status, round setup, and voice-call phone requirements, then creates application-scoped contact/resume data. Existing candidate identity is reused without overwriting global profile details. Same-job normalized-email duplicates are rejected.

## Application commands v2

Webhook: `POST /webhook/hiring/application-command`

The same server-authenticated route carries two commands: `decision` (Advance, Reject, Hold, Resume) and `update_contact`. n8n forwards each to `decide_application` or `update_application_contact` with the recruiter JWT. State transitions and their outbox events commit together in Postgres; the application UI does not write pipeline state directly.

## Required n8n variables

- `SUPABASE_URL`: project URL.
- `SUPABASE_ANON_KEY`: public/anon key; the recruiter's JWT supplies identity and RLS context.

Activate the exported workflows only after setting these variables and verifying their webhook URLs. The workflow exports are not automatically deployed or activated. Supabase JWT validation and RLS authorize each RPC; the public n8n base URL is only a routing value, not an authentication credential.

## Implemented workflow contracts

- Resume screening: `n8n/14 - Application Intake & Resume Screening.json` reads the stored resume and job description, validates a 1–100 score plus rationale, and inserts/updates the application through the screened-intake RPC. A recruiter explicitly chooses whether to start rounds.
- Notifications: `n8n/18 - Outbox Delivery Worker.json` leases transactional outbox rows, dispatches round invitations/rejections/voice calls and acknowledges success with a lease token. Failed work is retried with backoff; expired processing leases can be reclaimed.
- Calendar: `n8n/19 - Interviewer Calendar OAuth.json` connects each interviewer; `n8n/22 - Calendar Availability.json` checks the interviewer’s primary calendar; `n8n/3 - Booking & Availability.json` validates candidate tokens before booking/rescheduling, creates Google Meet events, and persists the slot. Refresh tokens are AES-GCM encrypted before storage. One self-reschedule is allowed before the event starts.
- Interview/assessment: `n8n/6 - AI Interview Engine.json` evaluates AI interview answers; `n8n/21 - Assignment Evaluation.json` evaluates assignment submissions against recruiter-approved criteria. Both write a standard 1–100 evaluation and leave the application for recruiter review.
- Voice: `n8n/13 - AI Voice Screening (Vapi).json` starts scheduled calls, gives the recording disclosure, requires a transcript of spoken answers, and stores a 1–100 evaluation. Calls with no transcript remain incomplete.
- Offers: `n8n/17 - Offer SignWell Dispatch.json` creates a real SignWell document from an active company template, sends it to the recruiter first, and relies on signing order to send it to the candidate. The offer counts toward openings only when SignWell reports the recruiter’s signing action.
- Retention: `n8n/20 - Retention Purge Worker.json` claims expired closed jobs, deletes private resume/assignment/recording objects through the Storage API, and only then deletes the database job and cascaded application records.

The job Open/Closed rules are implemented by migrations `0012_job_workspace_fields.sql`, `0015_application_actions_outbox.sql`, and `0017_confirmed_application_rejection.sql`: close freezes hiring actions; reopening resumes the saved retention countdown; after expiry, the job cannot reopen. Campaign details and interview-round sequence remain locked once applications exist.

## Required n8n variables and credentials

Configure these as n8n variables (never embed values in exported workflow JSON):

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `N8N_BASE_URL` (public n8n URL used for workflow-to-workflow webhooks)
- `APP_BASE_URL` (candidate booking, interview and assignment links)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CALENDAR_TOKEN_ENCRYPTION_KEY` (base64-encoded 32-byte key)
- `OPENAI_API_KEY`, `DIALNEXA_API_KEY`
- `SIGNWELL_TEST_MODE` (`true` until verified with a test document), `SIGNWELL_WEBHOOK_ID` (the webhook ID used to authenticate event hashes)

Also configure the `signwell_api` n8n HTTP Header Auth credential, SES/SMTP sender credentials, DialNexa/Vapi provider configuration as used by the imported flows, and any existing credit-guard subworkflow credentials. On self-hosted n8n, allow the built-in `crypto` module in Code nodes (for example, `NODE_FUNCTION_ALLOW_BUILTIN=crypto`). In Google Cloud, enable Calendar API and set the OAuth redirect URI to the callback URL shown by flow 19. In SignWell, create the webhook for `offer-signwell-callback-v2`, use the returned webhook ID in `SIGNWELL_WEBHOOK_ID`, and add each company’s template id plus exact SignWell placeholder names to `company_signwell_templates`.

## Supabase migration rollout

Apply the checked-in migrations in order through `0032_idempotent_interview_evaluations.sql` before activating the workers. They include service-role-only outbox/purge/evaluation RPCs, calendar credential storage, candidate token checks, job lifecycle/retention rules, and offer state transitions, plus idempotent interview sessions and evaluation writes. After applying, allow PostgREST to refresh its schema cache before importing/executing workflows that call new RPCs.

The exported flows are importable artifacts; changing this repository does not update the n8n instance. Import/update the listed JSON files, reselect the relevant n8n credentials, set the variables above, and verify webhook URLs and callbacks. Deactivate legacy Flow 1 (unscored intake) and Flow 8 (candidate-first offer). The new worker exports (Flows 17–22) are inactive and need activation after configuration. Run a test-mode SignWell offer and a candidate booking before setting `SIGNWELL_TEST_MODE=false`.
