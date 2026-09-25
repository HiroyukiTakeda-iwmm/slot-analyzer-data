# provenance（出典記録）

機種ごとの出典記録を `<機種ID>.json`（`machines/index.json` の id）の名前で置く。機種ファイルには何も足さない。

- 形: `docs/data-format.md` の「provenance（出典記録）」
- スキーマ: `schemas/provenance.schema.json`
- 採否の基準: `docs/quality-standards.md` の「出典と採否の基準」
- 検証: `npm run validate`（出典記録バリデーション）
