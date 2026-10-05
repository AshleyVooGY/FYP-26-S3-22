# Features 1, 2 and 10 frontend

This folder contains the vanilla HTML, CSS and JavaScript frontend for:

- Feature 1 — News Categorisation and Tagging
- Feature 2 — News Search and Filtering
- Feature 10 — News Recommendation

## Structure

- `index.html` — standalone feature shell used for demonstration and integration testing
- `features.css` — feature-only styles; shared colours and layout tokens come from `../css/shell.css`
- `app.js` — rendering, routing, form handling and user feedback
- `featureService.js` — Supabase queries and RPC calls only

The module reuses the shared client at `../../config/supabaseClient.js`. It does not include secret or service-role credentials.

## Routes

- `#browse` — browse published articles by category or tag
- `#search` — keyword search, date/category filters and sorting
- `#article/{id}` — article detail with related recommendations
- `#manage` — category/tag administration; mutations require an authenticated `system_admin`

## Backend contracts

- Tables: `articles`, `categories`, `tags`, `article_categories`, `article_tags`, `profiles`
- RPC: `search_news_articles`
- RPC: `get_recommended_articles`

## Main-site integration

The standalone shell intentionally keeps unrelated sidebar items disabled so it cannot replace or interfere with other members' pages. When integrating into the shared site, reuse these two modules:

1. Import the required functions from `featureService.js`.
2. Move the relevant renderer/event handlers from `app.js` into the shared page script.
3. Reuse the classes from `features.css`; they depend only on variables already defined by `shell.css`.
4. Link the main Categories menu to the F1 browse view, the top search control to F2, and the article page to the F10 recommendation renderer.

No changes to other team members' files or database scripts are required by this standalone module.
