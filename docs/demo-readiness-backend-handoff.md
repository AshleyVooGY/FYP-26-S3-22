# Demo readiness: deployed backend and integration results

## Deployment status — 15 October 2026
- Applied `supabase/Features/article-publishing-permissions-update.sql` to project xqcastmsficshjnwyqmk through its SQL Editor after a successful rollback rehearsal.
- Applied `supabase/Features/article-credibility-classification-reads.sql`: gives the server function SELECT access to already public classification labels.
- Deployed `supabase/functions/check-article-credibility/index.ts`. It preserves the existing Gemini assessment, 80% threshold and legacy approval, and additionally validates category/tag IDs and issues an exact-snapshot receipt.
- Existing tracked SQL files were restored; all database changes are in new SQL update scripts. The earlier untracked 001 draft was NOT deployed and has been moved to local work backup, outside the submitted SQL directory. Do not execute earlier handoff copies of that draft.
- Frontend and backend source changes are maintained in separate feature branches for review. AGENTS.md remains local and must not be staged.

## Existing online behavior preserved
The live project already had `internal.article_content_approvals`, `save_content_credibility_approval`, and an `enforce_credibility_before_publish` trigger. The updated migration extends that existing trigger function instead of installing conflicting checks. Legacy primary-category approvals remain supported during rollout; full category/tag snapshot validation is mandatory for the new transactional workspace RPC. Existing article API write grants are retained, subject to RLS and review triggers.

## New behavior
- One shared sidebar, working app navigation and F2 search.
- Explicit primary category selection; changing content or classifications invalidates the frontend review state.
- `save_my_article_workspace` atomically saves article content, primary category, category links and tag links. Ownership is checked and existing rows are locked. Failed writes roll back.
- Publishing through the workspace requires a trusted, exact-snapshot receipt, no older than 30 minutes and not already used. Direct published classification changes by ordinary users must go through the reviewed workspace.
- `set_user_role` checks admin status and disallows self-role changes. A profile trigger independently blocks direct ordinary-user role escalation while preserving existing admin clients.
- Existing legacy classifications are backfilled; F1 browse and F2 search include the primary category.

## Verified
1. Node service tests: 7/7 passed.
2. Browser: 14 app sidebars consistent, valid links/SVG/F2 entry; primary category selection; ordinary-user admin-page restriction; empty article validation.
3. Database transaction tests: registered user role escalation blocked via RPC AND direct UPDATE; atomic draft/link save; invalid-link rollback; publishing without receipt blocked; receipt forgery/replay blocked; reviewed publish succeeds; direct published tag deletion blocked; ordinary-user analytics denied; admin analytics and guarded role RPC succeed; guest workspace execution denied. Test data rolled back; no account roles were changed.
4. Real authenticated browser call to the deployed Gemini function: assessment succeeded, receipt returned, Publish unlocked. Classification changes locked Publish again.
5. Used that REAL AI receipt inside a rollback transaction: draft save -> publish -> find the exact article in F2 all succeeded. No test article remained published or saved after rollback.

## Limits / follow-up
- Admin and guest database behavior was tested with transaction-local JWT claims/roles, not by logging the browser into separate accounts. Ordinary-user UI was tested with the existing session.
- Preserving the old approval path avoids breaking existing frontend clients, but old clients only bind reviews to title/content/primary category. Full tag/multiple-category binding uses the new frontend/workspace RPC. After every client has migrated, a separate reviewed migration can retire legacy approvals and direct write paths.
- The AI assessment still uses the model's existing knowledge without live external verification. A score is not proof of factual correctness. No threshold was lowered or model result fabricated.
- Publication integration was verified in a rollback transaction, rather than publishing and permanently deleting test news.
- Revision history, history-page permission repair and all other deferred audit items are outside this change.
- Previous frontend image handling and quota displays remain as before; this task did not implement new subscription billing/quotas.

## Rollback materials
Original Edge Function and relevant live functions/policies were backed up under the local task's work/backend-backup directory. The rollback SQL restores the original credibility trigger function and removes the newly added profile/link guard triggers, leaving new data structures intact. Restoring the previous Edge Function source is a separate deployment. Do not roll back backend checks while continuing to use the new workspace frontend; restore matching frontend/backend together.
