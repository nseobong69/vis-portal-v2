# vis-portal-v2 — Phase 1 scaffold + Phase 2 design system

**This is a file scaffold, not a working deployed app.** It was written
in an environment with no network access, so nothing here has been
`npm install`ed, run, or deployed. Hand this to a real coding session
(e.g. Claude Code, or any environment with GitHub/Render access) to
actually build on top of it.

## What's real in this scaffold

- **`astro.config.mjs`** — configured for `output: 'server'`, which is
  what makes every file under `src/pages/` a true server-rendered route
  (Section 3's first hard requirement: real URLs, no client-side router).
- **`src/pages/staff/attendance.astro`** — a real route at
  `/staff/attendance` that demonstrates the full required pattern:
  1. Server-side auth check (`src/lib/auth.ts`) runs BEFORE any data is
     fetched.
  2. Logged-out → real redirect to `/login`, no data leaked.
  3. Wrong role → real redirect to `/403` (a distinct page, not silently
     swallowed).
  4. Correct role → real data fetched and rendered.
- **`src/lib/auth.ts`** — the server-side role-check helper, built
  against the 12-role model confirmed in the Project Prompt's Section
  2.1 (not a placeholder 4-role guess).
- **`src/pages/admissions.astro`** + **`src/components/admissions/AdmissionWizard.tsx`**
  — a real, server-rendered `/admissions` route hosting a full 8-step
  public application wizard (Basic → Biodata → Religion → Previous
  School → Parents → Health & Consent → Academic → Payment), ported
  field-for-field from the old app's `showAdmissionPublic()`. Submits via
  **`src/pages/api/admissions/submit.ts`**, a real server-side insert into
  the `admissions` table (with field validation), not a stub.
- **`src/lib/admissions-locations.ts`** — the Country → State → City
  lookup for the Biodata step. Per the confirmed Section 2.4 decision:
  keeps the live CountriesNow API, with a static fallback list (Nigeria
  states hardcoded, like the old app; a short static country list) if
  the API is unreachable or times out, so a dead free API can't silently
  break this part of the form the way it could before.

  **Also included, both requiring real credentials to actually run (see
  "Environment variables needed" below) — code is written and follows
  the old app's logic, but is untestable in this sandbox with no
  Supabase project or Paystack account connected:**
  - **Aptitude test (CBT) step** — `src/components/admissions/AptitudeTest.tsx`
    + `src/pages/api/admissions/cbt-check.ts` / `cbt-questions.ts` /
    `cbt-submit.ts`. Checks `cbt_exams` for an active `exam_type='aptitude'`
    exam matching the selected class; if found, inserts a mandatory Test
    step before Payment. Questions are fetched and graded server-side —
    `correct_answer` never reaches the browser, matching the old app's
    `get-cbt-questions` / `grade-cbt-exam` Edge Functions. **Narrower than
    the full CBT module on purpose:** no face verification, invigilator
    PIN, or violation tracking — those belong to the staff-proctored CBT
    Feature Checklist row, not the public admissions form.
  - **Paystack checkout** — `src/pages/api/admissions/paystack-initialize.ts`
    / `paystack-verify.ts` + `src/pages/admissions/paystack-callback.astro`.
    Opens a new tab to Paystack's hosted checkout (same popup-then-redirect
    pattern as the old app's `initiatePaystackAdmission`), then verifies
    server-side and reports back via `postMessage`. **This is a fresh
    implementation, not a port** — the old app's actual payment logic
    (`paystack-initialize`/`paystack-verify`) lived in Supabase Edge
    Functions in your live project, which were never in the HTML export,
    so there was nothing to copy. Functionally equivalent (secret key
    stays server-side, verified independently of what the client claims),
    implemented as plain Astro API routes instead of Supabase Edge
    Functions so it doesn't need a separate functions deploy.

  **Application reference number** — `src/pages/api/admissions/submit.ts`
  generates one on submit (`VIS/ADM/{year}/{5-char code}`, format matching
  the old app's own fallback pattern), checked for uniqueness against
  existing rows before insert. This IS real and needs no extra
  credentials to work. Note: it's an **application** reference, not the
  same thing as the *student* `admission_number` the old app only assigns
  later at staff approval, once an application is converted into an
  enrolled student (`genAdmNum()` — a different, internal admin-side
  step, out of scope for this public form).

  Still open regardless: email confirmation on submit, and the RLS policy
  for the `admissions` table's anon INSERT/SELECT (SELECT is needed for
  the reference-number uniqueness check in `submit.ts`).

### Environment variables needed for Paystack + CBT to actually work

Add to a `.env` (server-side, NOT `PUBLIC_`-prefixed for the secrets):
```
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxx   # from your Paystack dashboard
CLOUDINARY_CLOUD_NAME=your-cloud-name       # CBT identity/proctoring snapshots
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
The CBT routes use the existing `PUBLIC_SUPABASE_URL` /
`PUBLIC_SUPABASE_ANON_KEY` — just make sure `cbt_exams`/`cbt_questions`
RLS allows anon SELECT on those two tables (not `cbt_submissions`, which
only needs anon INSERT). The three `CLOUDINARY_*` vars sign identity/
proctoring photo uploads server-side (`sign-photo-upload.ts`) — same
account and secret the old app's own `sign-cloudinary-upload` Edge
Function used, just re-implemented as a plain Astro API route.

## What's NOT done — a real session still needs to

1. **Run `npm install`** — nothing here has been installed or verified
   to actually build.
2. **Wire up real Supabase Auth session handling.** `src/lib/supabase.ts`
   assumes a `sb-access-token` cookie as a placeholder — confirm against
   the old app's actual session mechanism (check the CSP comment in
   `index.html` about `ROLE locked via defineProperty` for context) and
   fix accordingly.
3. **Verify the `profiles.role` lookup in `src/lib/auth.ts`** against how
   the old app actually resolves role — this was a reasonable guess from
   the Phase 0 table list, not a verified line-by-line port.
4. **Build out the Attendance screen's real business logic** — daily
   marking, weekly/term register, PDF export (jsPDF), Excel export
   (SheetJS) — per Feature Checklist Section 2.2, row 17. The current
   page only proves the routing/auth pattern with a placeholder query.
5. **Push to a new GitHub repo (`vis-portal-v2`)** and connect it to a
   new Render service, per Phase 1's session prompt in the Project
   Prompt — neither of those steps could happen from this environment.
6. **Run the three direct-hit verification checks** from Phase 1's "Done
   when" criteria (logged-out redirect, wrong-role 403, correct-role real
   data — each confirmed via raw page source in a fresh incognito tab)
   once this is actually deployed.

## Phase 2 additions (design system)

- **`src/styles/tokens.css`** — color/font/spacing/radius/shadow tokens,
  sourced directly from `index.html`'s `:root` block and inline hexes.
- **`tailwind.config.mjs`** — Tailwind wired to those tokens.
- **`src/components/ui/`** — Button, Card, Input, Select, Table, Modal,
  Badge, Toast, all built on the tokens.
- **`src/pages/styleguide.astro`** — the Phase 2 review deliverable:
  every color, contrast ratio, and component shown together. **Approve
  this before Phase 3 starts.**
- `src/layouts/StaffLayout.astro` and `src/pages/staff/attendance.astro`
  restyled with the above as the required working example.
- See `Phase_2_Design_System_Output.md` (in the parent deliverable, not
  this repo) for the full WCAG contrast audit and sourcing notes.

## Phase 3 additions (Homepage / Public Site)

- **`src/pages/index.astro`** — the public homepage, served at the real
  root URL. Ported from `index.html`'s hero, story/values, "What Sets Us
  Apart", Student Life, News, Leadership, and footer sections.
- **`src/pages/about.astro`**, **`academics-overview.astro`**,
  **`student-life.astro`**, **`cbt-info.astro`** — public info pages that
  used to be full-screen JS modals; now real server-rendered routes.
- **`src/pages/admissions.astro`** — placeholder only; the admissions
  form is its own Feature Checklist row, not part of this pass.
- **`src/layouts/PublicLayout.astro`**, **`src/components/InfoRow.astro`**
  — shared shell/component for the pages above.
- See `Phase_3_Homepage_Output.md` (in the parent deliverable, not this
  repo) for the full card-by-card inventory, two undocumented sections
  found along the way (story/values, Student Life page), and open
  decisions that need your confirmation.

## Next steps for whoever picks this up

1. `npm install`, then `npm run dev` and check `/`, `/about`,
   `/academics-overview`, `/student-life`, `/cbt-info`, `/styleguide` —
   none of this has been through a real build yet, same caveat as
   Phases 1–2.
2. Wire `#news` on the homepage to the real `public_posts` table +
   realtime subscription (not done — needs real Supabase schema access).
3. Resolve the open decisions in `Phase_3_Homepage_Output.md` section 3.
4. Do the side-by-side comparison against the live homepage that Phase
   3's "Done when" criteria requires, once deployed.
5. Move to the next Feature Checklist row (Parent Portal, per the
   Project Prompt's recommended order) using the generic per-feature
   session prompt — Admissions (row 22) is a good candidate to fold in
   early since multiple pages already link to it.

## Phase 3c/3d additions (Parent + Student Portal, and closing Student Portal's open items)

- `src/pages/parent/*`, `src/pages/student/*` — see
  `Phase_3c_Parent_Portal_Output.md` / `Phase_3d_Student_Portal_Output.md`
  (parent deliverable, not this repo) for the screen-by-screen breakdown.
- **New table needed, not in the original schema:** `profile_email_otps`
  (`user_type text, user_id uuid, email text, code text, confirmed bool,
  expires_at timestamptz, created_at timestamptz default now()`) — backs
  the student profile's email-change verification
  (`api/student/profile/send-otp.ts` / `verify-otp.ts`). Add RLS so a row
  is only readable/writable by its own `user_id`.
- **New env vars needed to actually send the OTP email:**
  `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`,
  `EMAILJS_PRIVATE_KEY` (server-side, not `PUBLIC_`-prefixed). Without
  them, the OTP is generated and stored but delivery fails loudly
  (502 from `send-otp.ts`) rather than pretending to have sent an email.
- The student CBT exam-taking engine (`src/pages/student/exams/[id].astro`,
  `src/components/student/ExamRunner.tsx`,
  `src/pages/api/student/exams/*`) uses tables already in the original
  schema (`cbt_exams`, `cbt_questions`, `cbt_submissions`,
  `cbt_student_codes`) — no new tables needed there, just RLS that lets
  an authenticated student read questions minus `correct_answer` and
  insert their own `cbt_submissions` row.
