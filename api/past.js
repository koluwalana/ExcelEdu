// Fetches real JAMB/WAEC past questions from the ALOC question bank
// (questions.aloc.com.ng). Requires ALOC_ACCESS_TOKEN env var — register at
// https://questions.aloc.com.ng to get one. Returns {questions:[]} with a
// reason on any failure so the frontend can fall back to AI recall.

const SUBJECT_MAP = {
  "Mathematics": "mathematics",
  "English Language": "english",
  "Biology": "biology",
  "Chemistry": "chemistry",
  "Physics": "physics",
  "Government": "government",
  "Economics": "economics",
  "Literature": "englishlit",
  "Geography": "geography",
  "Commerce": "commerce",
  "Christian Religious Studies": "crk",
  "Islamic Religious Studies": "irk"
  // Agricultural Science is not in the ALOC bank — frontend falls back to AI
};

function clean(s) {
  return String(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.ALOC_ACCESS_TOKEN;
  if (!token) return res.status(200).json({ questions: [], reason: "not_configured" });

  const { exam, subject, year, count } = req.query;
  const slug = SUBJECT_MAP[subject];
  if (!slug) return res.status(200).json({ questions: [], reason: "unsupported_subject" });

  const type = exam === "WAEC" ? "wassce" : "utme";
  const n = Math.min(Math.max(parseInt(count, 10) || 5, 1), 20);
  const yearNum = parseInt(year, 10);
  const yearParam = yearNum ? `&year=${yearNum}` : "";

  try {
    // Request extra so we can drop image-based or incomplete questions
    const r = await fetch(
      `https://questions.aloc.com.ng/api/v2/q/${n * 2}?subject=${slug}${yearParam}&type=${type}`,
      { headers: { Accept: "application/json", AccessToken: token } }
    );
    const data = await r.json();
    if (!r.ok) return res.status(200).json({ questions: [], reason: "bank_error" });

    const raw = Array.isArray(data.data) ? data.data : (data.data ? [data.data] : []);
    const questions = raw
      .filter(q => q && q.question && q.option && q.answer && !q.image)
      .map(q => {
        const options = {};
        for (const k of ["a", "b", "c", "d", "e"]) {
          if (q.option[k]) options[k.toUpperCase()] = clean(q.option[k]);
        }
        return {
          question: clean(q.question),
          options,
          answer: String(q.answer).trim().toUpperCase(),
          explanation: q.solution ? clean(q.solution) : "",
          examyear: q.examyear || year,
          source: "bank"
        };
      })
      .filter(q => q.question && Object.keys(q.options).length >= 2 && q.options[q.answer])
      .slice(0, n);

    return res.status(200).json({ questions, source: "aloc" });
  } catch (e) {
    return res.status(200).json({ questions: [], reason: "fetch_failed" });
  }
}
