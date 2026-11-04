# Display name rules

Run only in a **new disposable PostgreSQL database**. Bootstrap creates synthetic
Auth/profile tables and the real repository signup trigger; never run it in
Supabase or a database containing real users.

```sh
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f tests/display-names/bootstrap.sql \
  -f supabase/Features/unique-display-names.sql \
  -f tests/display-names/rules.sql
node --test tests/account-settings.test.mjs tests/account-registration.test.mjs
```

Production migration order: existing schema/auth and subscription migrations,
then `Features/account-settings.sql`, then `Features/unique-display-names.sql`.
The new migration aborts if existing names conflict; it does not rename accounts.
Deploy the migration before serving the updated signup and Settings scripts.
The only public lookup returns a boolean, never account IDs or emails.

Checks cover signup transaction rollback, premium selection, duplicate direct
writes and RPCs, case/whitespace matching, saving your own name, Auth display
mirror updates, invalid names and anonymous rename denial. SQL test changes are
rolled back. JavaScript tests also cover concurrent-name error feedback and
availability failures without attempting account creation.
