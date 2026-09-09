# Combined PDF migration — what's in this batch

Ports **Feature Checklist row 14 ("Combined PDF")** from the old single-file
`index.html` into `vis-portal-v2`, following the same patterns already
established by the Results Entry port (`src/lib/results.ts` +
`src/pages/api/staff/results/action.ts` + `ResultsSheet.tsx`).

## New files

| File | Ported from (old `index.html`) | Notes |
|---|---|---|
| `src/lib/resultCard.ts` | `buildResultSheet()` (~L9883-10202) + `calcTotals`, `_tieRank`, `teacherComment`, `principalComment`, `genAffectiveTraits`, trait-scale constants, `isPupilClass`/`pupilOrStudent`, `escapeHTML`, `fmtStuName` | Same markup/inline-styles/dynamic sizing as the old template — this is a report card people already recognise, so no visual changes. Pure/isomorphic (no DOM, no Supabase) so it runs both server- and client-side. |
| `src/lib/combinedPdf.ts` | `renderCombinedPDFPage`/`generateCombinedPDF`'s data half, `canGenerateCombinedPDF`, `_getClassSigData`, `getClassResultsForRanking` (~L10267-10522) | Server-only. Runs every query with the caller's authenticated session (`createServerSupabase`) instead of the old app's anonymous browser client — same RLS-empty-result bug already fixed for Results Entry. |
| `src/lib/clientPdf.ts` | `downloadResultPDF()`/`generateCombinedPDF()`'s rasterisation half (~L10215-10480) | Browser-only. Same 794px off-DOM container, `scale:3.5` html2canvas capture, and page-fit math as the old app. QR codes now use the `qrcode` npm package instead of the old DOM-based `qrcodejs` widget — same result, no paint-timing workaround needed. |
| `src/pages/api/staff/combined-pdf/action.ts` | same dispatch pattern as `results/action.ts` | `init` → class list (with `level`, for the KNP/secondary permission gate); `data` → bulk per-student payload for one class/term/session, including the auto-publish-unpublished-rows side effect. |
| `src/components/staff/CombinedPdfPage.tsx` + `CombinedPdfIsland.tsx` | `renderCombinedPDFPage()`'s UI (~L10285-10314) | Class/Term/Session form + progress status line, same copy as the old app ("Loading student data…", "Building PDF for N students…", etc). |
| `src/pages/admin/combined-pdf.astro` | route wiring | Same auth/layout pattern as `results.astro`. Allowed roles match Checklist row 14 exactly: `super_admin`, `admin`, `proprietor`, `head_teacher`, `principal`, `teacher`. |

## Dependencies to add

This package's exported files didn't include a `package.json`, so add these
yourself at the project root:

```
npm i jspdf html2canvas qrcode
```

(`qrcode` ships its own types; no `@types/` package needed.)

## Left for a follow-up batch

- **Single-result "My Results" PDF download** (`downloadResultPDF()` in the
  old app, Checklist row 40 / `renderMyResults`). `resultCard.ts` and
  `clientPdf.ts`'s `downloadResultPDF()` already support this end-to-end —
  it just needs a student-facing page/component wired to it the same way
  `CombinedPdfPage.tsx` wires the class version. Left out of this batch
  since no student-portal `.astro`/`.tsx` files were included in the four
  zips this pass covers.
- **Cloudinary upload after single-result download** (old app also POSTs the
  generated blob to Cloudinary + upserts a `cloudinary_assets` row). Not
  ported here since it depends on the still-to-be-migrated
  `sign-cloudinary-upload` Edge Function wiring elsewhere in the app —
  wire it into `downloadResultPDF()`'s caller once that's in place.
- `checkAuth()` is imported with the same signature `results/action.ts`
  already assumes (`(cookies, roles[]) => { status, role, userId }`) — this
  batch doesn't re-verify that file since it wasn't in any of the four zips.
