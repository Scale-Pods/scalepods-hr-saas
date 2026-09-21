# Home / Landing Page Design

Date: 2026-09-19
Status: Approved

## Goal

A public landing page for ScalePods that presents the product (feature grid
drawn from the real app) and routes to auth. The recruiter app moves to
`/dashboard` so `/` can be publicly browsable.

## Routing

- `/` — public landing (`Home`)
- `/dashboard` — dashboard, behind existing `RequireAuth`
- `/auth` unchanged (email + Google)
- Candidate pages (`/book/...`, `/interview/...`) unchanged
- All existing in-app links to `/` (AppShell logo + nav, AuthPage post-login
  redirect, CampaignNew success redirect, CampaignDetail/CandidateProfile "back"
  links, catch-all) now point to `/dashboard`. Catch-all `*` points to `/`.

## Home component

Revamped in the style of keka.com's homepage with content drawn from
www.scalepods.co (approved follow-up):

- Keka palette applied ONLY on the landing page via a `.keka-landing` wrapper
  in `src/index.css` (Royal Blue `#7C46F1` primary, Denim `#1077DA` secondary,
  Shark-dark `#1b1d22` foreground for the final CTA panel, `#A6E26A` lime
  accent/success; equivalents for light + dark). The authenticated app keeps
  its default indigo palette.
- Logo tiles: brand mark placed on a `rounded-lg bg-primary` chip, `!invert`ed
  to stay white-level on the royal chip.
- Hero: headline from scalepods.co ("Automate the busywork. Unlock growth.")
  with a highlighted keyword box, "Claude Partner Network · Official Services
  Partner" pill, rounded-full CTAs -> `/auth`, "Free plan included" trust line,
  pipeline-snapshot mock card + floating stats chip (239 candidates).
- Trust strip: "Trusted by thousands of companies and investors..."
- Feature pillars: Hiring Cloud / Interview Cloud / Pipeline Cloud (app
  features), each with a tinted icon chip.
- Why ScalePods: 4 value bullets.
- Testimonials: 3 recruiter-style placeholder quotes with 5-star ratings.
- Final CTA: dark Shark panel, lime CTA button -> `/auth`.
- Footer: scalepods.co columns (Solutions / Platform / Connect,
  info@scalepods.co mailto, © 2026 ScalePods AI Infrastructure).

Forms/UI reuse: existing `Button` (via `Link`), `Card`-style divs, theme tokens
overridden under `.keka-landing`. No new deps.

## Files

- new `src/routes/Home.tsx`
- new `src/routes/Home.test.tsx`
- edit `src/routes/index.tsx`
- edit `src/components/AppShell.tsx` (nav `to: "/dashboard"`, logo links)
- edit `src/routes/AuthPage.tsx` (redirects)
- edit `src/routes/CampaignNew.tsx`, `CampaignDetail.tsx`, `CandidateProfile.tsx`
- edit `src/App.test.tsx` if needed

## Testing

- `Home.test.tsx`: hero + both auth links render
- update any test asserting `/` redirect
- typecheck + lint + build via existing scripts