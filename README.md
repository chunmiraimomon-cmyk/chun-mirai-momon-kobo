# MOMON GRAND PRIX: PRISM SHIFT

ブラウザで遊べる3Dカートレース。通常カップ、タイムアタック、クリエイト、EVOLUTION TOURを収録しています。

## 公開

GitHub Pagesの設定で **Source: GitHub Actions** を選択してください。
`main` の更新後、テストとビルドが成功すると自動公開されます。

公開先: https://chunmiraimomon-cmyk.github.io/chun-mirai-momon-kobo/

## 開発

Node.js 22.14以上を使用します。

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run dev
pnpm test
pnpm run test:game
```

`pnpm run build` はGitHub Pages用の静的ファイルを `dist/` に生成します。
別のリポジトリ名で公開する場合は `PAGES_BASE_PATH` とワークフローのパスを変更してください。
テクスチャ・ゴースト・旧版の素材URLもビルド時にそのパスへ調整されます。

## データと公開範囲

設定・実績・記録はブラウザのローカルストレージへ保存されます。
公開元が変わるため、従来のSites版の保存内容は自動では引き継がれません。
ソースとゲーム素材は公開リポジトリで閲覧できます。認証情報、個人設定、従来のGit履歴は含めていません。

本移植は公開形式のみを変更しています。走行物理、アイテム、スキル、CPU挙動は元のゲームのコードを使用します。
