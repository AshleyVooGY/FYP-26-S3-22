# Features 1, 2 and 10 frontend

This folder contains the vanilla HTML, CSS and JavaScript frontend for:

- Feature 1 — News Categorisation and Tagging
- Feature 2 — News Search and Filtering
- Feature 10 — News Recommendation

## Structure

- `index.html` — compatibility redirect for previously shared links
- `features.css` — feature-only styles; shared colours and layout tokens come from `../css/shell.css`
- `featureService.js` — Supabase queries and RPC calls only

The module reuses the shared client at `../../config/supabaseClient.js`. It does not include secret or service-role credentials.

## Legacy redirects

- `#browse` → shared `../categories.html`
- `#search` → shared `../search.html`
- `#article/{id}` → shared `../article.html?id={id}`
- `#manage` → shared `../categories.html?mode=manage`

Guests are redirected to `../welcome.html`. Browsing and searching are available only after sign-in, matching the access policy used by the main application.

## Backend contracts

- Tables: `articles`, `categories`, `tags`, `article_categories`, `article_tags`, `profiles`
- RPC: `search_news_articles`
- RPC: `get_recommended_articles`

## Main-site integration

F1 browsing and administration now run in `../categories.html`, F2 runs in `../search.html`, and F10 recommendations run in `../article.html`. The legacy entry point remains only to preserve old bookmarks and deployed links.

The shared pages reuse `featureService.js` and `features.css`; both depend on the shared Supabase client and `shell.css` design tokens.

No changes to other team members' files or database scripts are required by this standalone module.
