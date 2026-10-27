今日のニュース 自動更新版（GitHub用）

このZIPは差し替え・追加用です。GitHub内に同じ階層で置いてください。

  index.html                         置き換え（ニュース表示を自動データ対応）
  scripts/generate_news.py           追加（取得・問題選び・解説生成）
  .github/workflows/news_daily.yml   追加（毎日日本時間6:17に起動）
  news/README.txt                    追加（保存先の案内）

既存の教材・画像・学習記録のデータを消さないでください。R2の更新は不要です。
index.htmlは、2026-10-27時点でGitHubにあった版をもとにしています。
アップロード前に別の変更を加えた場合は、先に統合が必要です。

GitHubの対象リポジトリで Settings → Secrets and variables → Actions → New repository secret に
名前 ANTHROPIC_API_KEY として、使用するAnthropicのAPIキーを登録します。
Vercelに設定された値はGitHub Actionsに自動共有されません。キーをチャットに送らないでください。
利用量に応じたAnthropicの料金が発生します。実際の金額は利用中のモデルと料金設定で確認してください。

Actionsの「今日のニュース」から Run workflow を一度実行してください。前日の日本時間の記事から探します。
結果は news/daily/日付.json と news/daily/index.json に保存され、GitHubに自動コミットされます。
GitHub Actionsの書き込み権限やブランチ保護が必要に応じて設定されていることを確認してください。
初回データの反映と翌日の自動更新がVercelの画面に届くかは、実際の公開環境で確認が必要です。

既存問題との関係が弱い分野や、前日の見出しを取得できない分野は表示しない場合があります。
生成失敗時は過去の保存データを維持し、その日は未更新と表示します。
ニュースは見出し等をもとにAIが文章を作るため、初回は実際の発表と問題との対応を確認してください。
Googleニュースのリンク先や配信状況は変わる場合があります。前日の候補だけを使用します。
JSONと日時は保存されますが、2028年以降の祝日表示には追加更新が必要です。
