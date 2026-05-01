# Admin UI Fixes Design

## Goal
Update the admin experience to remove the unused Users section, improve report messaging, prevent no-op role updates, and ensure the admin nav link appears immediately after sign-in for authorized users across all pages.

## Scope
- Admin UI tab changes (remove Users section link and load path).
- Reports panel empty/error copy.
- Roles panel: disable Update Role button when no role change is selected.
- Global nav: ensure admin link appears immediately after auth and roles load.

## Non-Goals
- Refactor users management logic or delete unused functions.
- Rebuild navigation architecture or move to templating/partials.
- Change backend rules or permissions logic.

## Current Behavior Summary
- Users tab exists but is hidden and non-functional.
- Reports panel shows "No reports found" for empty data and shows full error messages on failure.
- Update Role button stays active even when selecting the same role.
- Admin link may not appear until a page reload after sign-in.

## Design
### Admin Tabs
- Remove the Users tab entry and prevent the Users tab from being loaded by `switchTab`.
- Keep Users JS functions unchanged but unused to minimize risk.

### Reports Panel
- If all report sources return empty results, show "No reports yet".
- If any fetch fails, show "Error could not load reports" (no error detail shown to end users).

### Roles Panel
- The Update Role button is visible but disabled when the selected role equals the current role for that member.
- When a new role is selected, the button becomes enabled.
- Disable state updates on selection change.

### Global Nav / Admin Link
- After auth state changes, once roles data is ready, call `syncSharedNav(user)` again to update the admin link immediately.
- Keep the admin link gated by `getUserAdminFlag` so only authorized users see it.

## Data Flow
- Auth state change triggers nav sync (current behavior) and a second sync after `rolesReady` resolves.
- Reports panel uses Firestore reads; only the UI copy changes for empty/error cases.
- Roles UI uses current role in `ROLE_DATA.userRoles` to determine button state.

## Error Handling
- Reports errors display a generic "Error could not load reports" message.
- Role update attempts with no change are prevented via disabled UI and existing guard.

## Testing Plan
- Sign in with admin account and verify Admin link appears without reload on multiple pages.
- Open Admin > Reports with no data: see "No reports yet".
- Simulate Firestore error (e.g., offline): see "Error could not load reports".
- Open Roles and confirm Update Role button is disabled when selection matches current role, enabled otherwise.
- Confirm Users tab is absent and other tabs still function.

## Rollback Plan
- Revert changes in `admin.html`, `admin.js`, and `firebase-config.js`.
