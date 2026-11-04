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
- No Lovable Cloud/Supabase/server functions; auth is a bearer token in localStorage and authenticated routes (`_app`) use `ssr: false`. Why: app must run as a client-side app against the external API.
- Role menus and route access are defined only in `src/lib/auth.ts` (`navByRole`). Why: single source for profile permissions.
