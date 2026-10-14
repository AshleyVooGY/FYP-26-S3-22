# Features 1, 2 and 10 frontend

This folder contains the vanilla HTML, CSS and JavaScript frontend for:

- Feature 1 — News Categorisation and Tagging
- Feature 2 — News Search and Filtering
- Feature 10 — News Recommendation

## Structure

- `index.html` — authenticated F1/F2 feature shell used while those views are migrated into shared pages
- `features.css` — feature-only styles; shared colours and layout tokens come from `../css/shell.css`
- `app.js` — rendering, routing, form handling and user feedback
- `featureService.js` — Supabase queries and RPC calls only

The module reuses the shared client at `../../config/supabaseClient.js`. It does not include secret or service-role credentials.

## Routes

- `#browse` — browse published articles by category or tag
- `#search` — keyword search, date/category filters and sorting
- `#article/{id}` — legacy route that redirects to the shared `../article.html?id={id}` page
- `#manage` — category/tag administration; mutations require an authenticated `system_admin`

Guests are redirected to `../welcome.html`. Browsing and searching are available only after sign-in, matching the access policy used by the main application.

## Backend contracts

- Tables: `articles`, `categories`, `tags`, `article_categories`, `article_tags`, `profiles`
- RPC: `search_news_articles`
- RPC: `get_recommended_articles`

## Main-site integration

The temporary shell keeps F1 browsing and F2 searching available without duplicating the main article-detail page. Article links now open the shared `article.html`, where F10 recommendations are rendered. When completing the remaining migration into shared pages:

1. Import the required functions from `featureService.js`.
2. Move the relevant renderer/event handlers from `app.js` into the shared page script.
3. Reuse the classes from `features.css`; they depend only on variables already defined by `shell.css`.
4. Move Categories and Search into shared pages, then replace this temporary entry point with a redirect.

No changes to other team members' files or database scripts are required by this standalone module.
