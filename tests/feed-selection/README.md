# For You selection limit

Use a new disposable database, with cluster roles `anon` and `authenticated`.
Never run this fixture against Supabase or existing user data.

```sh
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f tests/feed-selection/bootstrap.sql \
  -f supabase/Features/feature-07-user-preferences.sql \
  -f supabase/Features/personalized-news-feed.sql \
  -f tests/feed-selection/rules.sql
node --test tests/feed-selection/service.test.mjs
```

The SQL tests retain the original feed function in the disposable database,
compare its first 12 ranked articles with the new selection, and check pagination,
legacy snapshots, short/empty results, guest denial and cross-user cursors.

Deploy `Features/personalized-news-feed-selection-limit.sql` after
`Features/personalized-news-feed.sql`, before publishing the frontend. It changes
only the feed function; existing preferences, article data and RLS policies remain.
The service caps legacy snapshot totals at 12 to match backend cursor reads.
