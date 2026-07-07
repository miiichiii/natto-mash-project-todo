# Natto_MASH 管理ボード

Natto_MASHプロジェクトのタスク管理用GitHub Pagesサイト。

公開URL: https://miiichiii.github.io/natto-mash-project-todo/

サイト本体は、Firebase対応の静的ボードとして管理する。

- `index.html`
- `styles.css`
- `app.js`

タスク用Firestore collection: `nattoMashTasks`.

許可ユーザー限定の内部collection:

- `nattoMashBudgetFunds`
- `nattoMashBudgetAllocations`
- `nattoMashBudgetLineItems`
- `nattoMashWeeklyPlanItems`
- `nattoMashMouseCohortRows`
- `nattoMashBudgetAuditLog`

個体ID、未公開の正確な数値、検体保管場所、内部予算、個人連絡先、非公開ファイルパスを公開静的ファイルに入れない。

予算と週次実行データはFirestoreのみに置く。`index.html`、`app.js`、`tasks.json`、`public-note.md`、その他の公開静的ファイルに、内部金額やマウス群詳細を初期データとして書かない。

Firestore rulesでは、すべての内部collectionに同じ「メール確認済みの許可ユーザー」制限を適用する。このローカルrepoには実allowlist入りの本番rulesを置かない。公開用テンプレートとして `firestore.rules.example` を使い、Firebase側で同等の制限を適用する。

```txt
allow read, write: if isApprovedUser()
  && request.auth != null
  && request.auth.token.email_verified == true;
```

クローラー対策として、サイトには `robots.txt` と `noindex` meta tagを入れている。ただし、これはアクセス制御ではない。
