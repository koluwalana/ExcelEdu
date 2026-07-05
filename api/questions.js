const ALOC_BASE = "https://questions.aloc.com.ng/api/v2";

function normalizeQuestion(q) {
  if (!q || !q.question) return null;
  const opt = q.option || q.options || {};
  const letters = ["A", "B", "C", "D", "E"];
  const options = {};
  letters.forEach(l => {
    const v = opt[`option${l}`] ?? opt[l] ?? opt[l.toLowerCase()];
    if (v) options[l] = v;
  });
  if (Object.keys(options).length < 2) return null;

  let answer = (q.answer || "").toString().trim();
  const optionMatch = answer.match(/^option([A-Ea-e])$/);
  answer = optionMatch ? optionMatch[1].toUpperCase() : answer.slice(-1).toUpperCase();
  if (!options[answer]) return null;

  return {
    question: q.question,
    options,
    answer,
    explanation: q.solution || "No explanation was provided for this past question.",
    source: [String(q.examtype || "").toUpperCase(), q.examyear].filter(Boolean).join(" ")
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const ACCESS_TOKEN = process.env.ALOC_ACCESS_TOKEN;
  if (!ACCESS_TOKEN) return res.status(500).json({ questions: [], error: "Missing ALOC_ACCESS_TOKEN" });

  const { subject, type, year } = req.query;
  if (!subject) return res.status(400).json({ questions: [], error: "subject is required" });
  const count = Math.min(Math.max(parseInt(req.query.count, 10) || 1, 1), 20);

  const params = new URLSearchParams({ subject });
  if (type) params.set("type", type);
  if (year) params.set("year", year);

  const path = count > 1 ? `/q/${count}` : "/q";

  try {
    const r = await fetch(`${ALOC_BASE}${path}?${params.toString()}`, {
      headers: { AccessToken: ACCESS_TOKEN }
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ questions: [], error: data });
    const raw = Array.isArray(data.data) ? data.data : data.data ? [data.data] : [];
    const questions = raw.map(normalizeQuestion).filter(Boolean);
    return res.status(200).json({ questions });
  } catch (e) {
    return res.status(500).json({ questions: [], error: e.message });
  }
}
