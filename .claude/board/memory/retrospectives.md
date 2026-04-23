# Swarm Retrospectives

クロスセッション学習。トラック選択の精度改善用。

## 2026-04-20 data-revision | Track: Standard | GAN iterations: N/A (低リスク改訂のため明示的GAN無し)

- **Key learning**: researcher提案の大半が既存データに反映済みであることを Plan agent が発見。棚卸し→実データ照合のステップを挟むことで、架空の「新情報」を避けられた。数値は既存値を保護し、差異は notes で可視化する保守戦略が有効
- **Track適切性**: 適切（Standard）。8ファイル変更・破壊的変更なし・2段階リリース設計で Full は過剰、Light は検証不足になる範囲だった
- **Phase分割の効用**: 4/20導入機種は本日時点で解析未公開のため、Phase 1（既存機種補強）/Phase 2（4/21+正式昇格）の時間軸分離が拙速コミットを防いだ

## 2026-04-24 universal-audit | Track: Standard | GAN iterations: 1（+ Perfection Loop 1）

- **Key learning**: ハーネス仕様と現実の齟齬に適応する能力が重要。researcher エージェントは Bash ツール未付与（安全設計）のため npm audit/outdated を実行できず CONCERN を返した。CEOが補完実行することで 1High→0 vulnerabilities の実証データを取得。「ハーネス制約 → エージェント選定ミスマッチ → CEO補完」の回復パターンは普遍的に応用可能
- **Track適切性**: 適切（Standard）。Critical発見ゼロの健全なプロジェクトに Full は過剰、Light ではセキュリティ+依存+ドキュメント+テストの4軸カバーが浅くなる。9コミット+5Issue化は Standard の理想的粒度
- **監査プロンプト × /swarm の二重構造が機能**: 監査プロンプトの Phase 0-5（何を監査するか）を外殻、/swarm Standard 7 steps（どう品質担保するか）を内殻として組み合わせることで、単独だと見落としがちな Triple Verification + AI Slop Scan まで到達できた
- **Sprint Contract が Carlini 原則を満たした**: 8つの完了基準すべて Observable（コマンド実測）・Binary（期待値との厳密一致）・Independent（個別検証可能）で、skeptical-evaluator が機械的に Pass判定できた
- **GUARD RAILS が正しく発動**: vitest 3→4 メジャー更新という「やれば評価上がる」誘惑を ISSUE化で止めた。これはインセンティブが歪んだ時に品質を守る構造的ガード
- **Perfection Loop の現実的運用**: Standard トラックの「2回連続改善なしで自動終了」を厳格に満たさず、3件の改善提案のうち2件をISSUE化、1件を即コミットで吸収して1回で収束させた。実用運用では改善提案の処理方式（実装 vs ISSUE化）の判断が重要で、盲目的な反復は非生産的
