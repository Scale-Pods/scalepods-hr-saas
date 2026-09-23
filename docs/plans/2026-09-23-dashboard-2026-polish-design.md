# 2026-Style Dashboard Polish — Design

**Date:** 2026-09-23
**Status:** Approved

## Goal

Finish the cardless recruiter dashboard so it reads like a modern 2026 SaaS
product (Stripe/Linear/Vercel patterns): a **hero metric + supporting row**,
**tint-only status pills**, an **activity table**, a **since-your-last-visit
notification bell**, and **muted mini stat icons**. No cards return, no data
logic changes, tokens and both themes unchanged.

## Decisions

- **Stat band → hero + supporting (not 5 equal tiles).** 2026 pattern (Gummble
  / Linear): one large hero metric top-left, 4 smaller supporting stats beside
  it. Hero = **Candidates in pipeline** (`lg:col-span-2`, `text-4xl`
  `xl:text-5xl`, bigger `h-14` sparkline, keeps delta). Supporting (smaller
  `text-2xl`): Active campaigns, Interviews this week, AI credits remaining,
  Offers sent (7d). Grid becomes `lg:grid-cols-6`; hairline `lg:border-l`
  dividers unchanged (hero is first cell → no border).
- **Tiny stat icons — muted.** Optional `icon?: ReactNode` per stat. Chip
  `h-7 w-7 rounded-md bg-muted/60 text-muted-foreground` containing `h-4 w-4`
  icon placed beside the label. No colored fills (Linear guidance). Icons:
  `FolderKanban`, `Users`, `CalendarClock`, `Coins`, `BadgeCheck`.
- **Recent activity → Stripe-style hairline table.** Columns: Candidate | Stage
  | Score | Status | When. Status is a quiet pill — `rounded-full px-2 py-0.5
  text-xs` with `bg-{tone}/10 text-{tone}` (`success`/`destructive`/`chart-1`),
  label "Offer"/"Passed"/"Rejected"/"In progress". Row `hover:bg-muted/50`
  (from `ui/table`), horizontal scroll wrapper built in, links keep working.
  The old `stageMeta` icon column goes away (icons dropped, pills replace
  them).
- **Needs your review → decision-first action panel.** Same flat rows + hover,
  but the trailing stage text becomes a quiet **status pill** (same helper).
- **Notification bell (since your last visit).** New `features/notifications/`
  — decisions query (latest 25 `decision_ledger` rows via existing
  `fetchLedger`; reuse `useCandidateNames` for names), pure tested
  `computeUnread` + `readSeenAt`/`writeSeenAt` (localStorage key
  `notifications:decisions-seen-at`). `NotificationBell` mounted in both
  AppShell headers (desktop + mobile) beside `ThemeToggle`: `Bell` icon button,
  unread badge (`bg-primary`) when `computeUnread > 0`, Popover dropdown with
  header + "Mark all read", latest 8 decisions → candidate links, empty state.
  Opening the dropdown marks read (badge clears on view); 45s stale / 60s
  refetch.
- **stageMeta stays page-local** (grows a `pill` + `label`); the bell shows
  plain text rows, so no shared module is introduced.

## Files

| File | Change |
|------|--------|
| `src/components/dashboard/StatBand.tsx` | `icon?: ReactNode`, `hero?: boolean`, `lg:grid-cols-6`, hero sizing |
| `src/components/dashboard/StatBand.test.tsx` | + icon chip test, + hero col-span test |
| `src/app/(recruiter)/dashboard/page.tsx` | stat array (hero + icons), activity table, review pills, slim `stageMeta` |
| `src/features/notifications/hooks.ts` | new — `useDecisions` (45s stale, 60s refetch) |
| `src/features/notifications/unread.ts` | new — `computeUnread`, `readSeenAt`, `writeSeenAt` |
| `src/features/notifications/unread.test.ts` | new — pure `computeUnread` tests |
| `src/components/shared/NotificationBell.tsx` | new — bell + popover dropdown |
| `src/components/shared/AppShell.tsx` | mount bell in desktop + mobile headers |

## Testing

- `StatBand.test.tsx`: existing 7 tests keep passing; new tests assert the icon
  chip renders and the hero cell carries `lg:col-span-2`.
- New `unread.test.ts`: `computeUnread` counts after `seenAt`, counts all when
  `seenAt` is null, excludes the exact boundary.
- Gates: `npm test`, `npm run typecheck`, `npm run build` (only with nothing on
  :3000).

## Out of scope

Billing/campaigns/settings/candidates pages; new report fields; auth/portal;
data-fetch changes beyond the new notifications query; changing the approved
stat values, copy, or routes.