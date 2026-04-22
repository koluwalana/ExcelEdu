import { useState, useEffect, useRef } from "react";

// ── CONFIG ──────────────────────────────────────────────────────────────────
const PAYSTACK_PUBLIC_KEY = "pk_test_907954679d2f09b6314f874efe38fe702dd313d0";
const MONTHLY_PRICE_KOBO = 500000; // ₦5,000 in kobo
const FREE_QUESTIONS_LIMIT = 3;

const SUBJECTS = [
  "Mathematics","English Language","Biology","Chemistry",
  "Physics","Government","Economics","Literature","Geography","Commerce",
  "Agricultural Science","Christian Religious Studies","Islamic Religious Studies",
];

const EXAMS = ["JAMB", "WAEC"];

const SYSTEM_PROMPT = `You are ExcelEdu AI, a brilliant Nigerian exam prep tutor for JAMB and WAEC.

When asked to generate a question respond ONLY with valid JSON (no markdown, no extra text):
{
  "question": "question text",
  "options": {"A": "...", "B": "...", "C": "...", "D": "..."},
  "answer": "A",
  "explanation": "Clear, encouraging explanation in simple English that Nigerian SS2/SS3 students understand. Explain why the correct answer is right AND briefly why the others are wrong."
}

For general tutoring chat, respond as a warm, encouraging Nigerian tutor. Use simple English. Be motivating.`;

async function callClaude(messages, system = SYSTEM_PROMPT) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system,
        messages,
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || "";
  } catch {
    return "";
  }
}

async function generateQuestion(subject, exam) {
  const text = await callClaude([{
    role: "user",
    content: `Generate a ${exam} ${subject} multiple choice question. Return ONLY valid JSON, nothing else.`,
  }]);
  try {
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch { return null; }
}

function loadPaystack(email, onSuccess) {
  if (!window.PaystackPop) {
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.onload = () => openPaystack(email, onSuccess);
    document.head.appendChild(s);
  } else {
    openPaystack(email, onSuccess);
  }
}

function openPaystack(email, onSuccess) {
  const handler = window.PaystackPop.setup({
    key: PAYSTACK_PUBLIC_KEY,
    email,
    amount: MONTHLY_PRICE_KOBO,
    currency: "NGN",
    ref: "EXCELEDU_" + Date.now(),
    metadata: { custom_fields: [{ display_name: "Plan", value: "ExcelEdu Monthly" }] },
    callback: (res) => { if (res.status === "success") onSuccess(res.reference); },
    onClose: () => {},
  });
  handler.openIframe();
}

export default function ExcelEdu() {
  const [screen, setScreen] = useState("landing");
  const [isPaid, setIsPaid] = useState(false);
  const [freeUsed, setFreeUsed] = useState(0);
  const [emailInput, setEmailInput] = useState("");

  const [exam, setExam] = useState("JAMB");
  const [subject, setSubject] = useState("Mathematics");
  const [question, setQuestion] = useState(null);
  const [loadingQ, setLoadingQ] = useState(false);
  const [selected, setSelected] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [streak, setStreak] = useState(0);

  const [mockQuestions, setMockQuestions] = useState([]);
  const [mockAnswers, setMockAnswers] = useState({});
  const [mockTime, setMockTime] = useState(0);
  const [mockRunning, setMockRunning] = useState(false);
  const [mockDone, setMockDone] = useState(false);
  const [mockLoading, setMockLoading] = useState(false);
  const [mockCurrent, setMockCurrent] = useState(0);
  const timerRef = useRef(null);
  const MOCK_DURATION = 30 * 60;
  const MOCK_COUNT = 10;

  const [chatMessages, setChatMessages] = useState([{
    role: "assistant",
    content: "👋 Welcome to ExcelEdu AI! I'm your personal JAMB & WAEC tutor. Ask me anything — past question topics, explanations, formulas, anything at all. Let's get you that A1! 🎯",
  }]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  useEffect(() => {
    if (mockRunning && !mockDone) {
      timerRef.current = setInterval(() => {
        setMockTime(t => {
          if (t >= MOCK_DURATION) { clearInterval(timerRef.current); setMockDone(true); setMockRunning(false); return t; }
          return t + 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [mockRunning, mockDone]);

  const formatTime = (s) => `${String(Math.floor((MOCK_DURATION - s) / 60)).padStart(2, "0")}:${String((MOCK_DURATION - s) % 60).padStart(2, "0")}`;

  const gateCheck = (action) => {
    if (isPaid) { action(); return; }
    if (freeUsed < FREE_QUESTIONS_LIMIT) { action(); return; }
    setScreen("paywall");
  };

  const startQuiz = () => {
    gateCheck(async () => {
      setScreen("quiz");
      setQuestion(null); setSelected(null); setExplanation(null);
      setLoadingQ(true);
      const q = await generateQuestion(subject, exam);
      setQuestion(q); setLoadingQ(false);
    });
  };

  const handleAnswer = (opt) => {
    if (selected) return;
    setSelected(opt);
    const correct = opt === question.answer;
    setScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    setStreak(s => correct ? s + 1 : 0);
    setExplanation(question.explanation);
    if (!isPaid) setFreeUsed(f => f + 1);
  };

  const nextQuestion = async () => {
    gateCheck(async () => {
      setSelected(null); setExplanation(null); setQuestion(null);
      setLoadingQ(true);
      const q = await generateQuestion(subject, exam);
      setQuestion(q); setLoadingQ(false);
    });
  };

  const startMock = () => {
    gateCheck(async () => {
      setScreen("mock");
      setMockLoading(true);
      setMockQuestions([]); setMockAnswers({}); setMockDone(false);
      setMockTime(0); setMockCurrent(0);
      const qs = await Promise.all(
        Array.from({ length: MOCK_COUNT }, () => generateQuestion(subject, exam))
      );
      setMockQuestions(qs.filter(Boolean));
      setMockLoading(false);
      setMockRunning(true);
    });
  };

  const submitMock = () => {
    clearInterval(timerRef.current);
    setMockRunning(false);
    setMockDone(true);
  };

  const mockScore = mockQuestions.reduce((acc, q, i) => acc + (mockAnswers[i] === q.answer ? 1 : 0), 0);

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    if (!isPaid && freeUsed >= FREE_QUESTIONS_LIMIT) { setScreen("paywall"); return; }
    const msg = chatInput.trim();
    const history = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(history);
    setChatInput("");
    setChatLoading(true);
    if (!isPaid) setFreeUsed(f => f + 1);
    const reply = await callClaude(history.map(m => ({ role: m.role, content: m.content })));
    setChatMessages([...history, { role: "assistant", content: reply }]);
    setChatLoading(false);
  };

  const handlePayment = () => {
    if (!emailInput.trim()) return;
    loadPaystack(emailInput.trim(), () => {
      setIsPaid(true);
      setScreen("success");
    });
  };

  const acc = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;

  const globalStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Fredoka+One&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f0faf4; font-family: 'Nunito', sans-serif; }
    @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
    @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
    @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
    @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
    @keyframes pop { 0%{transform:scale(0.8);opacity:0} 100%{transform:scale(1);opacity:1} }
    @keyframes slideUp { from{transform:translateY(30px);opacity:0} to{transform:translateY(0);opacity:1} }
    .tab-btn:hover { background: rgba(0,200,83,0.1) !important; }
    .feature-card { transition: transform 0.2s, box-shadow 0.2s; }
    .feature-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,0.12) !important; }
    .cta-btn { transition: transform 0.15s; cursor: pointer; }
    .cta-btn:hover { transform: scale(1.04); }
    textarea:focus { border-color: #00c853 !important; }
    input:focus { border-color: #00c853 !important; outline: none; }
  `;

  // ── LANDING ──
  if (screen === "landing") return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #e8f5e9 0%, #f9fbe7 60%, #e3f2fd 100%)", fontFamily: "'Nunito', sans-serif" }}>
      <style>{globalStyles}</style>
      <nav style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100, borderBottom: "1px solid rgba(0,200,83,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #00c853, #00e676)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Fredoka One', cursive", fontSize: 18, color: "#fff", boxShadow: "0 4px 12px rgba(0,200,83,0.35)" }}>E</div>
          <span style={{ fontFamily: "'Fredoka One', cursive", fontSize: 20, color: "#00922e" }}>ExcelEdu</span>
        </div>
        <button onClick={() => setScreen("home")} className="cta-btn" style={{ background: "linear-gradient(135deg, #00c853, #00e676)", color: "#fff", border: "none", borderRadius: 20, padding: "8px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,200,83,0.3)" }}>
          Start Free →
        </button>
      </nav>

      <div style={{ textAlign: "center", padding: "56px 24px 40px", animation: "slideUp 0.6s ease" }}>
        <div style={{ fontSize: 64, marginBottom: 16, animation: "float 3s ease-in-out infinite", display: "inline-block" }}>🎓</div>
        <h1 style={{ fontFamily: "'Fredoka One', cursive", fontSize: "clamp(32px,8vw,52px)", color: "#00922e", lineHeight: 1.15, marginBottom: 16 }}>
          Pass JAMB & WAEC<br /><span style={{ color: "#ff6d00" }}>First Time. Every Time.</span>
        </h1>
        <p style={{ fontSize: 16, color: "#4a7a5a", maxWidth: 420, margin: "0 auto 32px", lineHeight: 1.7, fontWeight: 600 }}>
          Practice unlimited questions, get instant AI explanations, and sit timed mock exams — all for less than ₦170 per day.
        </p>
        <button onClick={() => setScreen("home")} className="cta-btn" style={{ background: "linear-gradient(135deg, #00c853, #00e676)", color: "#fff", border: "none", borderRadius: 16, padding: "16px 40px", fontWeight: 900, fontSize: 18, cursor: "pointer", boxShadow: "0 8px 24px rgba(0,200,83,0.4)" }}>
          Try 3 Questions FREE 🚀
        </button>
        <p style={{ marginTop: 12, fontSize: 12, color: "#888" }}>No credit card needed to start</p>
      </div>

      <div style={{ padding: "0 20px 48px", maxWidth: 500, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            { icon: "📝", title: "Practice MCQs", desc: "Unlimited AI-generated questions for all subjects" },
            { icon: "🤖", title: "AI Tutor Chat", desc: "Ask any question, get instant clear explanations" },
            { icon: "⏱️", title: "Mock Exams", desc: "Full timed exams just like the real thing" },
            { icon: "📊", title: "Track Progress", desc: "See your score and accuracy improve daily" },
          ].map((f, i) => (
            <div key={i} className="feature-card" style={{ background: "#fff", borderRadius: 16, padding: "18px 14px", boxShadow: "0 4px 16px rgba(0,0,0,0.07)", border: "1px solid rgba(0,200,83,0.12)", animation: `pop 0.4s ease ${i * 0.1}s both` }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{f.icon}</div>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#0d2b1a", marginBottom: 4 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: "#6b8f76", lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 28, background: "linear-gradient(135deg, #00c853 0%, #00e676 100%)", borderRadius: 20, padding: "28px 24px", textAlign: "center", boxShadow: "0 12px 32px rgba(0,200,83,0.35)", color: "#fff" }}>
          <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 36, marginBottom: 4 }}>₦5,000/month</div>
          <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 20, fontWeight: 600 }}>Unlimited access · Cancel anytime</div>
          {["Unlimited practice questions", "AI tutor available 24/7", "Timed mock exams", "13 subjects covered", "JAMB + WAEC syllabus"].map((item, i) => (
            <div key={i} style={{ fontSize: 14, marginBottom: 6, fontWeight: 700 }}>✓ {item}</div>
          ))}
          <button onClick={() => setScreen("home")} className="cta-btn" style={{ marginTop: 20, background: "#fff", color: "#00922e", border: "none", borderRadius: 12, padding: "14px 36px", fontWeight: 900, fontSize: 16, cursor: "pointer", width: "100%" }}>
            Get Started Free →
          </button>
        </div>
      </div>
    </div>
  );

  // ── SUCCESS ──
  if (screen === "success") return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #e8f5e9, #f9fbe7)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Nunito', sans-serif", padding: 24 }}>
      <style>{globalStyles}</style>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div style={{ fontSize: 72, marginBottom: 16, animation: "float 2s ease-in-out infinite", display: "inline-block" }}>🎉</div>
        <h2 style={{ fontFamily: "'Fredoka One', cursive", fontSize: 32, color: "#00922e", marginBottom: 12 }}>You're In!</h2>
        <p style={{ color: "#4a7a5a", fontSize: 16, marginBottom: 32, lineHeight: 1.6, fontWeight: 600 }}>Payment successful! You now have unlimited access to ExcelEdu. Time to start passing those exams! 💪</p>
        <button onClick={() => setScreen("home")} style={{ background: "linear-gradient(135deg,#00c853,#00e676)", color: "#fff", border: "none", borderRadius: 14, padding: "14px 40px", fontWeight: 900, fontSize: 16, cursor: "pointer", boxShadow: "0 8px 20px rgba(0,200,83,0.35)" }}>
          Start Studying →
        </button>
      </div>
    </div>
  );

  // ── PAYWALL ──
  if (screen === "paywall") return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg, #e8f5e9, #f9fbe7)", fontFamily: "'Nunito', sans-serif", padding: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{globalStyles}</style>
      <div style={{ maxWidth: 400, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🔒</div>
          <h2 style={{ fontFamily: "'Fredoka One', cursive", fontSize: 28, color: "#00922e", marginBottom: 8 }}>Free Trial Ended</h2>
          <p style={{ color: "#6b8f76", fontSize: 15, lineHeight: 1.6, fontWeight: 600 }}>You've used your 3 free questions. Unlock unlimited access for just <strong style={{ color: "#ff6d00" }}>₦5,000/month</strong>.</p>
        </div>
        <div style={{ background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 8px 24px rgba(0,0,0,0.08)", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#888", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Your Email</div>
          <input type="email" placeholder="Enter your email address" value={emailInput} onChange={e => setEmailInput(e.target.value)}
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "2px solid #c8e6c9", fontSize: 15, fontFamily: "'Nunito', sans-serif", color: "#0d2b1a" }} />
          <button onClick={handlePayment} style={{ marginTop: 16, width: "100%", background: "linear-gradient(135deg, #00c853, #00e676)", color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontWeight: 900, fontSize: 16, cursor: "pointer", boxShadow: "0 6px 18px rgba(0,200,83,0.35)", fontFamily: "'Nunito', sans-serif" }}>
            Pay ₦5,000 — Unlock Everything 🚀
          </button>
          <p style={{ textAlign: "center", fontSize: 11, color: "#aaa", marginTop: 10 }}>Secured by Paystack · Cancel anytime</p>
        </div>
        <button onClick={() => setScreen("home")} style={{ width: "100%", background: "none", border: "none", color: "#888", fontSize: 13, cursor: "pointer", padding: 8 }}>← Go back</button>
      </div>
    </div>
  );

  // ── MAIN APP WRAPPER ──
  return (
    <div style={{ minHeight: "100vh", background: "#f0faf4", fontFamily: "'Nunito', sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <style>{globalStyles}</style>

      {/* HEADER */}
      <div style={{ background: "linear-gradient(135deg, #00c853 0%, #00e676 100%)", padding: "14px 20px 0", boxShadow: "0 4px 20px rgba(0,200,83,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Fredoka One', cursive", fontSize: 16, color: "#fff" }}>E</div>
            <span style={{ fontFamily: "'Fredoka One', cursive", fontSize: 18, color: "#fff" }}>ExcelEdu</span>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {score.total > 0 && (
              <>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 900, fontSize: 16, color: "#fff" }}>{acc}%</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 1 }}>Score</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 900, fontSize: 16, color: "#fff" }}>{streak}🔥</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 1 }}>Streak</div>
                </div>
              </>
            )}
            {!isPaid && <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 12, padding: "2px 10px", fontSize: 11, color: "#fff", fontWeight: 700 }}>{Math.max(0, FREE_QUESTIONS_LIMIT - freeUsed)} free left</div>}
            {isPaid && <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 12, padding: "2px 10px", fontSize: 11, color: "#fff", fontWeight: 700 }}>✓ Pro</div>}
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.1)", borderRadius: "12px 12px 0 0", padding: 4 }}>
          {[["home","🏠","Home"],["quiz","📝","Practice"],["mock","⏱️","Mock"],["chat","💬","Tutor"]].map(([s, icon, label]) => (
            <button key={s} className="tab-btn" onClick={() => s === "quiz" ? startQuiz() : s === "mock" ? startMock() : setScreen(s)} style={{
              flex: 1, padding: "8px 4px", borderRadius: 8, border: "none",
              background: screen === s ? "#fff" : "transparent",
              color: screen === s ? "#00922e" : "rgba(255,255,255,0.8)",
              fontWeight: screen === s ? 800 : 600, fontSize: 11,
              cursor: "pointer", transition: "all 0.15s", fontFamily: "'Nunito', sans-serif",
            }}>
              <div style={{ fontSize: 16 }}>{icon}</div>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* HOME */}
      {screen === "home" && (
        <div style={{ padding: "24px 20px", animation: "fadeUp 0.4s ease" }}>
          <h2 style={{ fontFamily: "'Fredoka One', cursive", fontSize: 24, color: "#00922e", marginBottom: 6 }}>Hello, Scholar! 👋</h2>
          <p style={{ color: "#6b8f76", fontSize: 14, marginBottom: 24, fontWeight: 600 }}>What are you studying today?</p>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#888", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Exam</div>
            <div style={{ display: "flex", gap: 10 }}>
              {EXAMS.map(e => (
                <button key={e} onClick={() => setExam(e)} style={{ flex: 1, padding: "12px", borderRadius: 12, border: exam === e ? "2px solid #00c853" : "2px solid #ddd", background: exam === e ? "#e8faf0" : "#fff", color: exam === e ? "#00922e" : "#888", fontWeight: 800, fontSize: 16, cursor: "pointer", transition: "all 0.15s", fontFamily: "'Nunito', sans-serif" }}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#888", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Subject</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {SUBJECTS.map(s => (
                <button key={s} onClick={() => setSubject(s)} style={{ padding: "10px 12px", borderRadius: 10, textAlign: "left", border: subject === s ? "2px solid #00c853" : "2px solid transparent", background: subject === s ? "#e8faf0" : "#fff", color: subject === s ? "#00922e" : "#444", fontSize: 13, fontWeight: subject === s ? 800 : 600, cursor: "pointer", transition: "all 0.15s", fontFamily: "'Nunito', sans-serif", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <button onClick={startQuiz} style={{ width: "100%", padding: "16px", borderRadius: 14, background: "linear-gradient(135deg,#00c853,#00e676)", color: "#fff", fontWeight: 900, fontSize: 17, border: "none", cursor: "pointer", boxShadow: "0 6px 20px rgba(0,200,83,0.35)", fontFamily: "'Nunito', sans-serif", marginBottom: 12 }}>
            Start Practice Questions →
          </button>
          <button onClick={startMock} style={{ width: "100%", padding: "14px", borderRadius: 14, background: "#fff", color: "#00922e", fontWeight: 800, fontSize: 15, border: "2px solid #00c853", cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
            ⏱️ Start 30-Min Mock Exam
          </button>
        </div>
      )}

      {/* QUIZ */}
      {screen === "quiz" && (
        <div style={{ padding: "20px", animation: "fadeUp 0.3s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <button onClick={() => setScreen("home")} style={{ background: "none", border: "none", color: "#888", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>← Home</button>
            <div style={{ background: "#e8faf0", border: "1px solid #00c853", borderRadius: 20, padding: "4px 14px", fontSize: 12, color: "#00922e", fontWeight: 800 }}>{exam} · {subject}</div>
            <div style={{ fontSize: 13, color: "#888", fontWeight: 700 }}>{score.correct}/{score.total}</div>
          </div>

          {loadingQ && (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ fontSize: 40, animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</div>
              <p style={{ color: "#888", marginTop: 16, fontWeight: 700 }}>Generating your question...</p>
            </div>
          )}

          {!loadingQ && question && (
            <div>
              <div style={{ background: "#fff", borderRadius: 16, padding: "20px", marginBottom: 16, boxShadow: "0 4px 16px rgba(0,0,0,0.07)", border: "1px solid #e8f5e9" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#00c853", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>Question</div>
                <p style={{ fontSize: 16, lineHeight: 1.7, color: "#0d2b1a", fontWeight: 600, margin: 0 }}>{question.question}</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                {Object.entries(question.options).map(([opt, text]) => {
                  let bg = "#fff", border = "2px solid #e8f5e9", color = "#333";
                  if (selected) {
                    if (opt === question.answer) { bg = "#e8faf0"; border = "2px solid #00c853"; color = "#00922e"; }
                    else if (opt === selected) { bg = "#fff3f3"; border = "2px solid #ff1744"; color = "#cc0000"; }
                  }
                  return (
                    <button key={opt} onClick={() => handleAnswer(opt)} style={{ padding: "14px 16px", borderRadius: 12, textAlign: "left", background: bg, border, color, fontSize: 14, cursor: selected ? "default" : "pointer", display: "flex", gap: 12, alignItems: "flex-start", transition: "all 0.2s", fontFamily: "'Nunito', sans-serif", fontWeight: 700, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                      <span style={{ minWidth: 28, height: 28, borderRadius: 8, background: opt === question.answer && selected ? "#00c853" : opt === selected && selected ? "#ff1744" : "#f0f4f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: (opt === question.answer || opt === selected) && selected ? "#fff" : "#666", flexShrink: 0 }}>{opt}</span>
                      <span style={{ lineHeight: 1.6, paddingTop: 2 }}>{text}</span>
                    </button>
                  );
                })}
              </div>

              {selected && explanation && (
                <div style={{ background: "#e8faf0", border: "2px solid #00c853", borderRadius: 14, padding: "16px", marginBottom: 16, animation: "fadeUp 0.3s ease" }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: "#00922e", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
                    {selected === question.answer ? "✅ Correct! Well done!" : "❌ Not quite — here's why:"}
                  </div>
                  <p style={{ fontSize: 13, color: "#2d5a3d", lineHeight: 1.7, margin: 0, fontWeight: 600 }}>{explanation}</p>
                </div>
              )}

              {selected && (
                <button onClick={nextQuestion} style={{ width: "100%", padding: "14px", borderRadius: 12, background: "linear-gradient(135deg,#00c853,#00e676)", color: "#fff", fontWeight: 900, fontSize: 16, border: "none", cursor: "pointer", boxShadow: "0 6px 16px rgba(0,200,83,0.3)", fontFamily: "'Nunito', sans-serif" }}>
                  Next Question →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* MOCK */}
      {screen === "mock" && (
        <div style={{ padding: "20px", animation: "fadeUp 0.3s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <button onClick={() => { clearInterval(timerRef.current); setScreen("home"); }} style={{ background: "none", border: "none", color: "#888", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>← Home</button>
            <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 18, color: mockTime > MOCK_DURATION - 300 ? "#ff1744" : "#00922e" }}>
              ⏱️ {mockRunning ? formatTime(mockTime) : mockDone ? "Done!" : "--:--"}
            </div>
            <div style={{ fontSize: 13, color: "#888", fontWeight: 700 }}>{Object.keys(mockAnswers).length}/{mockQuestions.length}</div>
          </div>

          {mockLoading && (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ fontSize: 40, animation: "spin 1s linear infinite", display: "inline-block" }}>⚙️</div>
              <p style={{ color: "#888", marginTop: 16, fontWeight: 700 }}>Building your mock exam...</p>
              <p style={{ color: "#aaa", fontSize: 13 }}>Generating {MOCK_COUNT} questions</p>
            </div>
          )}

          {!mockLoading && mockDone && (
            <div style={{ textAlign: "center", padding: "24px 0", animation: "fadeUp 0.4s ease" }}>
              <div style={{ fontSize: 64, marginBottom: 12 }}>{mockScore >= 7 ? "🏆" : mockScore >= 5 ? "👍" : "📚"}</div>
              <h2 style={{ fontFamily: "'Fredoka One', cursive", fontSize: 28, color: "#00922e", marginBottom: 8 }}>Exam Complete!</h2>
              <div style={{ fontSize: 48, fontWeight: 900, color: "#ff6d00", marginBottom: 8 }}>{mockScore}/{mockQuestions.length}</div>
              <div style={{ fontSize: 15, color: "#6b8f76", marginBottom: 20, fontWeight: 700 }}>
                {Math.round((mockScore / mockQuestions.length) * 100)}% · {mockScore >= 7 ? "Excellent! 🔥" : mockScore >= 5 ? "Good effort! 💪" : "Keep practising! 📖"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {mockQuestions.map((q, i) => (
                  <div key={i} style={{ background: "#fff", borderRadius: 12, padding: "12px 16px", textAlign: "left", border: `2px solid ${mockAnswers[i] === q.answer ? "#00c853" : "#ff6060"}`, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: mockAnswers[i] === q.answer ? "#00922e" : "#cc0000", marginBottom: 4 }}>
                      Q{i + 1} · {mockAnswers[i] === q.answer ? "✅ Correct" : `❌ You: ${mockAnswers[i] || "—"} · Answer: ${q.answer}`}
                    </div>
                    <div style={{ fontSize: 12, color: "#444", lineHeight: 1.5, fontWeight: 600 }}>{q.question.substring(0, 90)}...</div>
                  </div>
                ))}
              </div>
              <button onClick={startMock} style={{ width: "100%", padding: "14px", borderRadius: 12, background: "linear-gradient(135deg,#00c853,#00e676)", color: "#fff", fontWeight: 900, fontSize: 15, border: "none", cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>
                Try Another Mock →
              </button>
            </div>
          )}

          {!mockLoading && !mockDone && mockQuestions.length > 0 && (
            <div>
              <div style={{ background: "#e8f5e9", borderRadius: 8, height: 6, marginBottom: 16, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "linear-gradient(90deg, #00c853, #00e676)", borderRadius: 8, width: `${(mockTime / MOCK_DURATION) * 100}%`, transition: "width 1s linear" }} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                {mockQuestions.map((_, i) => (
                  <button key={i} onClick={() => setMockCurrent(i)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "'Nunito', sans-serif", background: mockCurrent === i ? "#00c853" : mockAnswers[i] ? "#e8faf0" : "#fff", color: mockCurrent === i ? "#fff" : mockAnswers[i] ? "#00922e" : "#888", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }}>
                    {i + 1}
                  </button>
                ))}
              </div>

              {mockQuestions[mockCurrent] && (
                <div>
                  <div style={{ background: "#fff", borderRadius: 16, padding: "18px", marginBottom: 14, boxShadow: "0 4px 14px rgba(0,0,0,0.07)", border: "1px solid #e8f5e9" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#00c853", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Question {mockCurrent + 1}</div>
                    <p style={{ fontSize: 15, lineHeight: 1.7, color: "#0d2b1a", fontWeight: 600, margin: 0 }}>{mockQuestions[mockCurrent].question}</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                    {Object.entries(mockQuestions[mockCurrent].options).map(([opt, text]) => (
                      <button key={opt} onClick={() => setMockAnswers(a => ({ ...a, [mockCurrent]: opt }))} style={{ padding: "12px 16px", borderRadius: 10, textAlign: "left", background: mockAnswers[mockCurrent] === opt ? "#e8faf0" : "#fff", border: `2px solid ${mockAnswers[mockCurrent] === opt ? "#00c853" : "#eee"}`, color: mockAnswers[mockCurrent] === opt ? "#00922e" : "#444", fontSize: 14, cursor: "pointer", display: "flex", gap: 10, fontFamily: "'Nunito', sans-serif", fontWeight: 700, transition: "all 0.15s" }}>
                        <span style={{ minWidth: 26, height: 26, borderRadius: 6, background: mockAnswers[mockCurrent] === opt ? "#00c853" : "#f0f4f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: mockAnswers[mockCurrent] === opt ? "#fff" : "#666", flexShrink: 0 }}>{opt}</span>
                        {text}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    {mockCurrent < mockQuestions.length - 1 ? (
                      <button onClick={() => setMockCurrent(c => c + 1)} style={{ flex: 1, padding: "12px", borderRadius: 10, background: "linear-gradient(135deg,#00c853,#00e676)", color: "#fff", fontWeight: 800, fontSize: 15, border: "none", cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>Next →</button>
                    ) : (
                      <button onClick={submitMock} style={{ flex: 1, padding: "12px", borderRadius: 10, background: "linear-gradient(135deg,#ff6d00,#ff9100)", color: "#fff", fontWeight: 800, fontSize: 15, border: "none", cursor: "pointer", fontFamily: "'Nunito', sans-serif" }}>Submit Exam ✓</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CHAT */}
      {screen === "chat" && (
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 118px)" }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid #e8f5e9", background: "#fff" }}>
            <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: 16, color: "#00922e" }}>AI Tutor 🤖</div>
            <div style={{ fontSize: 11, color: "#6b8f76", fontWeight: 700 }}>Ask anything about JAMB & WAEC</div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10, background: "#f8fdf9" }}>
            {chatMessages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", animation: "fadeUp 0.2s ease" }}>
                <div style={{ maxWidth: "82%", padding: "12px 16px", borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: m.role === "user" ? "linear-gradient(135deg, #00c853, #00e676)" : "#fff", color: m.role === "user" ? "#fff" : "#0d2b1a", fontSize: 14, lineHeight: 1.7, fontWeight: 600, boxShadow: "0 2px 10px rgba(0,0,0,0.08)", border: m.role !== "user" ? "1px solid #e8f5e9" : "none" }}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ display: "flex", gap: 6, padding: "8px 16px" }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#00c853", animation: `bounce 0.8s ease ${i * 0.15}s infinite` }} />)}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div style={{ padding: "12px 16px", borderTop: "1px solid #e8f5e9", background: "#fff" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }} placeholder="Ask about any topic or past question..." rows={2}
                style={{ flex: 1, background: "#f0faf4", border: "2px solid #c8e6c9", borderRadius: 12, padding: "10px 14px", color: "#0d2b1a", fontSize: 14, resize: "none", outline: "none", fontFamily: "'Nunito', sans-serif", fontWeight: 600 }} />
              <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading} style={{ width: 44, height: 44, borderRadius: 10, background: chatInput.trim() ? "linear-gradient(135deg,#00c853,#00e676)" : "#eee", border: "none", cursor: chatInput.trim() ? "pointer" : "default", color: "#fff", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>→</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
