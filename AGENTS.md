# saa-dojo(SAA Dojo)

AWS Certified Solutions Architect – Associate に向けた非公式の学習 PWA(Vite + React + TypeScript)。問題・レッスンなどの教材は content/ にある。

## 関連
- remote: `Uni-K-Pip/saa-dojo`(public)。main への push で GitHub Pages に公開される。
- `../saa-dojo-ops`: 非公開の関連リポジトリ(教材の制作と検証の道具、作業状態)

## 進め方
- ブランチ: develop が統合用の既定、main はリリース専用。
- 確認: `npm run validate`
- 読む順: README.md、docs/content-guide.md、docs/app-spec.md
- 上流の設計(未実装を含む): docs/learning-design.md(目標、教材の体系、学習コース、網羅と受け入れの基準、計画)、docs/visual-materials-design.md(図解・操作型教材)。教材の種類や計画に関わる作業のときに読む。

## 引き継ぎ
- 教材の進み具合は `../saa-dojo-ops/catalog/wave1-plan.md` で確かめる。
- 1 つの作業ツリーに書き込むセッションは 1 つ。並行するときは worktree を分け、ブランチ名に担当を入れる(`claude/…`、`codex/…`)。
