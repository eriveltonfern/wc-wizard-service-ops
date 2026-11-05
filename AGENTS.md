<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- All data access goes through `src/lib/api.ts` (external PHP REST API); screens never fetch directly nor import `src/mocks/`. Why: backend lives outside this project.
- `docs/api-contract.md` is the API source of truth; `src/lib/types.ts` mirrors its schemas and screens call `src/lib/endpoints.ts` (one function per route), never `api.*` directly. The mock server in `src/mocks` (localStorage "wccheck.mockdb") must implement every contract route with the real API's behavior; `VITE_API_URL` includes the `/api` prefix. Why: mock and real API must be interchangeable.
- No Lovable Cloud/Supabase/server functions; auth is a bearer token in localStorage and authenticated routes (`_app`) use `ssr: false`. Why: app must run as a client-side app against the external API.
- Role menus and route access are defined only in `src/lib/auth.ts` (`navByRole`). Why: single source for profile permissions.
- Default build (Lovable preview/Publish) keeps the standard nitro config; the Hostinger build is `BUILD_TARGET=hostinger npx vite build` (`nitro: false` + `tanstackStart.spa`, shell `/index.html`) and only `dist/client/` (includes `public/.htaccess`) is deployed to Apache. Why: Lovable hosting needs the nitro worker output, while Hostinger shared hosting has no Node runtime.
- Every screen follows `docs/design/layout-padrao.md`: shell/headers from `src/components/layout/`, shared visuals from `src/components/ui-kit/`, colors only via tokens in `src/styles.css`. Why: one consistent visual standard across the app.
- Prototype screens whose routes the real API doesn't have yet use example data simulated in `src/mocks/preview/` (separate localStorage key, derived from the main mock data), are documented in `docs/api-contrato-proposta.md`, and show `PreviewBanner`. Why: the user validates every screen before the PHP API implements those routes.
- Field actions captured offline (cleanings, ticket start/finish) are queued on the device by `src/lib/outbox.ts` (IndexedDB "wccheck"/"outbox"; a failed write shows an error, never "queued") and resent with the same `idempotency_key`. Why: field work must never be lost or duplicated when the connection drops.
- Which ticket/review buttons appear comes from the server's `can` flags on each ticket, not from role checks in screens. Why: the UI holds no business rules.
- Every compliance number (Painel, Pendências, Histórico, Relatórios, Fechamento) comes from the single server calculation (`computeStats` in the preview mock, `/stats` contract); screens never compute percentages themselves. Why: all screens must show identical numbers for the same filter.
- The QR page `/q/$token` is public (outside `_app`, no login) and only calls `/public/*` routes; the mock answers `/public/*` before checking the token. Why: QR codes are for anonymous customer ratings, not field work.
- Feature modules are switched on by `VITE_MODULES` via `src/lib/modules.ts` (mocks: all on; real API without it: only always-on registrations); a disabled module is hidden from menus, its routes redirect home and no screen calls its API routes. Why: staged rollout on Hostinger.
- Test-only controls (PreviewBanner, simulated offline, test logins/reset) render only when `USE_MOCKS`. Why: production must not show prototype tooling.
- `deploy/` is generated (Hostinger zip as base64 + BUILD.txt) and must never be edited by hand; regenerate it from the build. Why: it must match an actual build.
