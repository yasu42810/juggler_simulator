# juggler_simulator（スロ設定ナビ）

ジャグラーシリーズ（北電子のパチスロ）の設定推測シミュレータ。ホールのデータカウンタの値（総回転数・BIG・REG）と自分で数えたぶどう回数から、設定1〜6それぞれである確率を計算し、グラフで表示する。打ちながらタップで数えて推定の推移を見る「実戦モード」も持つ。GitHub Pages で公開し、スマホから使う（オフライン対応の PWA）。

初版はマイジャグラーV。機種データ（JSON）や計算モデルを足すことで、他のジャグラーへ広げられる構造にしている。

> 結果は推定であり、設定を確定・保証するものではありません。本アプリはメーカー・ホールとは関係ありません。

## 開発

```bash
npm ci
npm run dev        # 開発サーバー（http://localhost:5173/juggler_simulator/）
npm test           # 単体テスト・検算テスト（Vitest）
npm run typecheck  # 型チェック
npm run build      # 本番ビルド（dist/）
npm run preview    # 本番ビルドの確認（Service Worker も動く）
```

検算値の作り直し・モデルの総当たり検証（Python 3 + SciPy が必要）:

```bash
python3 scripts/golden.py          # tests/golden/<機種>.json を作り直す
python3 scripts/golden.py --brute  # 超幾何による周辺化を総当たり計算と比べる
```

## 構成

| 場所 | 内容 |
|---|---|
| `src/core/` | 計算（DOM に依存しない純粋関数）。`models/` に機種のモデル、`priors/` に事前分布 |
| `src/machines/data/` | 機種データ（1機種 = 1 JSON）。自動で読み込まれる |
| `src/state/` | 画面の状態、保存（localStorage）、実戦モードの記録 |
| `src/charts/`, `src/ui/` | グラフと画面（Preact + Chart.js） |
| `tests/` | Vitest のテストと検算値 |
| `docs/` | 要件定義・外部設計・内部設計・調査メモ |

## 機種を追加するには

1. `docs/research/<id>-spec.md` に数値・出典・データ種別をまとめる。
2. 判別要素が BIG・REG・ぶどう（・REG 内訳）だけなら、`src/machines/data/<id>.json` を作る（`status: "draft"` から始める）。形式は `my-juggler-v.json` と[内部設計 §5](docs/03_internal_design.md)を参照。
3. `python3 scripts/golden.py` で検算値を作り、`npm test` が通れば `status: "active"` にする。

判別要素が違う機種（チェリーに設定差があるなど）は、`src/core/models/` に新しいモデルを足して `models/index.ts` に登録する（内部設計 §4.7）。

## 公開（GitHub Pages）

`main` に push すると `.github/workflows/deploy.yml` がテスト・ビルドして GitHub Pages に公開する。初回はリポジトリの Settings → Pages → Source を「GitHub Actions」にする必要がある。

## ドキュメント

| 文書 | 内容 |
|---|---|
| [docs/01_requirements.md](docs/01_requirements.md) | 要件定義 |
| [docs/02_external_design.md](docs/02_external_design.md) | 外部設計（画面・入出力・可視化） |
| [docs/03_internal_design.md](docs/03_internal_design.md) | 内部設計（統計モデル・データ構造・テスト・配信） |
| [docs/04_open_issues.md](docs/04_open_issues.md) | 未決事項 |
| [docs/research/my-juggler-v-spec.md](docs/research/my-juggler-v-spec.md) | マイジャグラーV のスペック調査メモ |
| [docs/research/setting-distribution.md](docs/research/setting-distribution.md) | ホールの設定配分（事前分布の根拠）の調査メモ |
