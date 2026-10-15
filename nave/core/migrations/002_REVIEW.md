# Read-only pilot status RPC — review gate

Proposed SQL: `002_pilot_test_status_DRAFT.sql`. **NOT EXECUTED**.

- Does not reveal pilot phone, UUID or other personal details.
- Requires an authenticated JWT at assurance level aal2, and existing admin membership.
- Checks NAVE-0001, online + verified test channel and recent inbound within 23 h.
- Cannot authorize sending Meta messages. Still requires explicit outbound permission and routing isolation.
- Existing `nave_is_admin()` has SECURITY DEFINER and checks auth.uid() membership.
- Explicitly revoke PUBLIC/anon execution; grant only authenticated.
- PostgreSQL function must be created by the approved migration owner in a controlled change window.
- Before applying: review SQL in production, test with anon, nonadmin aal1, admin aal1, admin aal2, and ensure no identifying fields are returned.
- Consider replacing 23 h with Meta actual conversation eligibility; message windows and template requirements vary.
- This function intentionally reports false for unauthorized sessions rather than exposing a reason.
