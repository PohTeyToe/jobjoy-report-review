-- design_review schema needs explicit GRANTs for the anon and authenticated
-- roles. RLS policies alone are not sufficient — Postgres requires that the
-- role also have schema USAGE and table-level privileges before RLS is
-- consulted. This migration also exists as a record of the manual change
-- applied to PostgREST config: db_schema must include "design_review" so
-- requests with the right Accept-Profile / Content-Profile header reach the
-- right schema.

grant usage on schema design_review to anon, authenticated;

grant select, insert, update, delete on all tables in schema design_review to anon, authenticated;

alter default privileges in schema design_review
  grant select, insert, update, delete on tables to anon, authenticated;
