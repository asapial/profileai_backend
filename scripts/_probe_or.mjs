import "dotenv/config";

const key = process.env.OpenRouter_API_KEY;
if (!key) { console.error("No key"); process.exit(1); }

const models = [
  "openai/gpt-oss-20b:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "openrouter/owl-alpha",
];

for (const m of models) {
  const t0 = Date.now();
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: m,
        messages: [{ role: "user", content: 'Reply with JSON: {"ok":true}' }],
        response_format: { type: "json_object" },
      }),
    });
    const text = await r.text();
    console.log(`[${m}] status=${r.status} dt=${Date.now()-t0}ms body=${text.slice(0,400)}`);
  } catch (e) {
    console.log(`[${m}] THROW dt=${Date.now()-t0}ms ${e?.message||e}`);
  }
}