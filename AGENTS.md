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
- Field cleanings captured offline are queued on the device by `src/lib/outbox.ts` (localStorage "wccheck.outbox") and resent with the same `idempotency_key`. Why: field work must never be lost or duplicated when the connection drops.
