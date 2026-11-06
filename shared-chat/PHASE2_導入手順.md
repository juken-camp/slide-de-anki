# 共有グルチャ：歴史人物AI・第2段階の導入手順

このZIPは **2026年11月6日 GitHub `juken-camp/slide-de-anki` のコミット `1fbf93fedd4f4d912439b7a87dc94ec2d112c5ef`** を元に作った差分です。

## 既存の設定・データはそのまま

- Supabaseプロジェクト、ログインメール（Resend/SMTP）、管理者UUID、`001_shared_chat.sql`、既存グループと人間の投稿は **作り直し不要**。
- これまでの1人用「異次元グルチャ」への生成・保存・通知処理は変更していません。
- 共有AIは既存ルームごとに **初期値OFF**。設定が未完了でも勝手にAI料金が発生しません。

## 1. 追加ファイルをGitHubへアップロード

このZIPを展開し、フォルダ階層を保ったまま既存リポジトリに上書きしてください。`himiko.html` と `vercel.json` も変更されているため含めてください。旧ファイルを削除しないでください。

Vercelで新しいデプロイが成功したことを確認します。**共有AIはまだONにしないでください。**

## 2. Supabaseで追加SQLを1回だけ実行

Supabase > SQL Editor に `shared-chat/002_shared_chat_ai.sql` の内容をすべて貼り付けて実行します。

**重要：** `001_shared_chat.sql` は再実行しないでください。`002` は既存データを保持したまま列・待機キュー・通知情報・関数を追加するマイグレーションです。`begin`/`commit` 内で実行するため、SQLエラーならロールバックされます。

`shared_chat_private` をData API公開スキーマに追加しないでください。

## 3. Vercelで環境変数を確認・追加

Project > Settings > Environment Variables（Production）

| キー | 設定 | 内容 |
| --- | --- | --- |
| `SHARED_CHAT_SUPABASE_SERVICE_ROLE_KEY` | **新規** | SupabaseのAPI Keysにある `service_role` または `sb_secret_...` 。**絶対にブラウザHTMLやGitHubのソースに貼らない** |
| `SHARED_CHAT_AI_ENABLED` | **新規** | `1` （この値だけではAIは生成されません。管理者が各部屋でONにして開始） |
| `SHARED_CHAT_CRON_SECRET` | 任意・推奨 | 24文字以上のランダムな秘密文字列。すでにVercelに `CRON_SECRET` があれば、それを使い、追加不要 |
| `SHARED_CHAT_SUPABASE_URL` | 既存 | 変更不要 |
| `SHARED_CHAT_SUPABASE_ANON_KEY` | 既存 | 変更不要。公開キーのまま維持 |
| `ANTHROPIC_API_KEY` | 既存 | 共有AIでも同じAPIを使用。従量課金の対象 |
| `HIMIKO_VAPID_SUBJECT` / `HIMIKO_VAPID_PUBLIC_KEY` / `HIMIKO_VAPID_PRIVATE_KEY` | 既存・任意 | 3つそろっている場合に、利用者ごとのプッシュ通知ボタンを表示 |

**環境変数を変更したらVercelを再デプロイします。** Service-roleキーはサーバー側の `api/shared-chat-tick.js` のみで使用し、クライアントには送信しません。

## 4. GitHub ActionsのSecretsを追加

GitHub > `juken-camp/slide-de-anki` > Settings > Secrets and variables > Actions > New repository secret

| 名前 | 値 |
| --- | --- |
| `SHARED_CHAT_TICK_URL` | 実際に利用しているVercelサイトの `https://(ドメイン)/api/shared-chat-tick` |
| `SHARED_CHAT_TICK_SECRET` | Vercel側の `SHARED_CHAT_CRON_SECRET`、なければ既存の `CRON_SECRET` と**完全に同じ文字列** |

`.github/workflows/shared_chat_ai_tick.yml` が5分おきに自動実行し、AI発言の配信・次の会話生成・プッシュ通知送信を行います。秘密情報が未登録ならジョブは何もせず終了します。

デプロイ直後の試験は GitHub > Actions > `Shared Chat AI Scheduler` > Run workflow で実行できます。GitHubの定期ジョブは混雑時に遅れたりスキップされたりするため、**秒単位の即時通知は保証しません**。

## 5. 実機でテスト

1. 共有ルームを管理者で開き、「参加者・管理」から「歴史人物の自動会話を開始」を押す。AIによる生成費用がかかることを確認するダイアログが出ます。
2. GitHub Actionsで `Shared Chat AI Scheduler` を手動実行する（または定期実行を待つ）。実行履歴がSuccessになっていることを確認。
3. 共有ルームに複数の人物が順に現れることを確認。別アカウント・別端末で同じメッセージ順・日本時間の表示・発言者・本文を比較。
4. 人間から発言し、両方に表示されることを確認。AI停止→既に表示した投稿は残り、未配信AI投稿は破棄されることを確認。
5. 各自で通知ONを試す。通知にはブラウザの許可が必要です。サポートされていない端末では動きません。
6. 1人用の異次元グルチャ、個人チャット、教材の表示が今までどおりか確認。

## 仕様・制限

- **全員同じ会話**：AIシーンはグループごとに1回生成してデータベースに保存。表示時刻・投稿順・内容を共有します。
- **自動進行**：アプリを閉じてもGitHub Actionsのサーバージョブが進行し、次回のログイン時に過去ログが残っています。
- **自然な間隔**：同一シーン内でも秒〜数分の発言間隔、シーン間は約40〜100分。実際に公開されるのは次の定期ジョブなので、5分以上の時間ずれが起こり得ます。
- **生成費用の制御**：5シーンをまとめて1リクエストで生成。最大2バッチ/部屋/日本時間の1日、全ルーム合計最大6バッチ/日。各ルームOFFで無料（Anthropic利用なし）。
- **既読・未読**：各ユーザーの `last_read_seq` を元に集計し、AI発言も数えます。過去100件とページ送りは既存と同じ。
- **通知**：本人の許可・購読情報と最終通知位置をルームごとに保存。人間とAIの投稿を対象とし、既読済みには再通知しない設計。GitHub Actions実行まで数分以上遅延する場合があります。
- **停止**：ルームの管理者だけが制御。既に表示済みの投稿は残り、未配信キューは取り消します。システム全体の停止はVercel `SHARED_CHAT_AI_ENABLED=0` とGitHub ActionsのSecretsを解除（またはworkflow無効化）。
- **ログイン**：Phase1と同じく、再読み込み・再起動すると再ログインが必要です。今回は認証セッション永続化を変更していません。
- **招待・承認**：Phase1を維持しています。

## 追加費用について（重要）

GitHubの**公開リポジトリの標準Linuxランナー**はGitHubの規約上無料で利用できます。ただしAI生成を始めると **Anthropic APIが従量課金** されます。2026年11月時点のHaiku 5.5は、10万入力トークン以下の通常リクエストで入力100万トークンあたりUS$0.10、出力100万トークンあたりUS$0.50（変更される可能性あり）。出力文字量・トークン数・有料サービスの契約状態により実際の請求は変わります。

VercelのHobbyのCronは1日1回までのため、今回はGitHub Actionsを5分おきに使います。Supabase/Vercelの無料枠には独自の上限があります。データベース・実通信・プッシュ通知を含む本番環境での動作確認は、実際のデプロイ後に行う必要があります。

**安全な公開順：** 「GitHubアップロード」→「追加SQL」→「Vercel環境変数」→「GitHubのSecrets」→「実機テスト」→「管理者がルームでAI開始」。
