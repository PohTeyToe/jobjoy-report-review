-- Phase: anon-auth + author-only delete (realtime fix)
--
-- Realtime DELETE events default to shipping just the primary key in `old`.
-- That breaks our subscription filters:
--
--   subscribePinsForVariant uses `filter: 'variant=eq.<slug>'` — without the
--   row's `variant` column on the wire, every DELETE is silently dropped on
--   the wire's filter side, so other open tabs never learn the pin was
--   removed.
--
-- Setting REPLICA IDENTITY FULL ships every column on UPDATE/DELETE so the
-- filter can match and downstream subscribers can apply the change locally.
-- Cost: a bit more WAL traffic per write, fine at our scale (low-volume
-- review tool).
--
-- Idempotent.

alter table design_review.pins replica identity full;
alter table design_review.comments replica identity full;
