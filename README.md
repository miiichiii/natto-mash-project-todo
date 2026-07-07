# Natto_MASH Project Todo

Public GitHub Pages site for the Natto_MASH project todo.

Public URL: https://miiichiii.github.io/natto-mash-project-todo/

Site content is maintained as a static Firebase-enabled board:

- `index.html`
- `styles.css`
- `app.js`

Firestore collection: `nattoMashTasks`.

Restricted internal collections for approved users:

- `nattoMashBudgetFunds`
- `nattoMashBudgetAllocations`
- `nattoMashBudgetLineItems`
- `nattoMashWeeklyPlanItems`
- `nattoMashMouseCohortRows`
- `nattoMashBudgetAuditLog`

Do not add raw animal IDs, unpublished exact numerical results, sample storage locations, internal budgets, personal contact details, or private file paths.

Budget and weekly execution data must remain in Firestore only. Do not seed internal amounts or mouse cohort details in `index.html`, `app.js`, `tasks.json`, `public-note.md`, or other public static files.

Firestore rules must apply the same verified approved-user gate to every restricted internal collection. The local repo does not contain production rules with the real allowlist; use `firestore.rules.example` as the public template and apply the equivalent policy in Firebase:

```txt
allow read, write: if isApprovedUser()
  && request.auth != null
  && request.auth.token.email_verified == true;
```

Crawler policy: the site includes `robots.txt` and `noindex` meta tags to discourage indexing. This is not access control.
