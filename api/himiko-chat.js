// /api/chat.js  — Vercel Serverless Function
// 環境変数 ANTHROPIC_API_KEY を使って Anthropic API を呼び出す

module.exports = async function handler(req, res) {
  // POST のみ許可
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // APIキーを環境変数から取得
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY が設定されていません" });
  }

  // リクエストボディのバリデーション
  const { system, messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages は空でない配列で指定してください" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5", // 最新の低コストモデル
        max_tokens: 768, // 新トークナイザーによるトークン増加に備える
        thinking: { type: "disabled" }, // 人物との対話では応答速度を優先
        ...(system ? { system } : {}),
        messages,
      }),
    });

    // Anthropic API がエラーを返した場合
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errorData?.error?.message || `Anthropic API error: ${response.status}`,
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error("Anthropic API 呼び出しエラー:", err);
    return res.status(500).json({ error: "サーバー内部エラーが発生しました" });
  }
}
