import { useEffect, useState } from 'react';

interface Question {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string | null;
  option_d: string | null;
  marks: number;
}
interface Exam {
  id: string;
  title: string;
  duration_minutes: number;
  class_name: string;
  subject_name: string;
}

async function call(payload: object) {
  const res = await fetch('/api/student/cbt/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    const err: any = new Error(data.error || 'Request failed.');
    err.payload = data;
    throw err;
  }
  return data;
}

export default function ExamTaking({ examId }: { examId: string }) {
  const [phase, setPhase] = useState<'loading' | 'needsCode' | 'ready' | 'submitted' | 'error'>('loading');
  const [error, setError] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState<{ score: number; total_marks: number; percentage: number } | null>(null);
  const [resultsUpdated, setResultsUpdated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function fetchExam(code?: string) {
    setPhase('loading');
    setError('');
    try {
      const data = await call({ action: 'getExam', examId, accessCode: code });
      setExam(data.exam);
      setQuestions(data.questions || []);
      setSecondsLeft((data.exam.duration_minutes || 60) * 60);
      setPhase('ready');
    } catch (e: any) {
      if (e.payload?.needsCode) {
        setPhase('needsCode');
      } else if (e.payload?.alreadySubmitted) {
        setResult(e.payload.alreadySubmitted);
        setPhase('submitted');
      } else {
        setError(e.message);
        setPhase('error');
      }
    }
  }

  useEffect(() => {
    fetchExam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'ready' || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [phase, secondsLeft]);

  useEffect(() => {
    if (phase === 'ready' && secondsLeft === 0) {
      submit(); // time's up — auto-submit whatever is answered
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, phase]);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const data = await call({ action: 'submit', examId, answers });
      setResult(data.submission);
      setResultsUpdated(!!data.resultsUpdated);
      setPhase('submitted');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function fmtTime(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  if (phase === 'loading') return <div className="p-8 text-center text-brand-brown-light">Loading exam…</div>;

  if (phase === 'error') {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-lg border border-danger-700 p-6 text-center text-danger-700">{error}</div>
    );
  }

  if (phase === 'needsCode') {
    return (
      <div className="max-w-sm mx-auto bg-white rounded-lg border border-brand-cream-dark shadow-sm p-6 flex flex-col gap-3 text-center">
        <div className="font-heading font-bold text-brand-brown-dark">Enter Access Code</div>
        <p className="text-sm text-brand-brown-light">This exam requires an access code.</p>
        <input
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
          className="border border-brand-cream-dark rounded-sm px-3 py-2 text-center tracking-widest text-lg"
          placeholder="ACCESS CODE"
        />
        <button onClick={() => fetchExam(accessCode)} className="bg-brand-brown text-white rounded-md px-4 py-2 font-medium">
          Enter Exam
        </button>
        {error && <div className="text-sm text-danger-700">{error}</div>}
      </div>
    );
  }

  if (phase === 'submitted' && result) {
    const pct = result.percentage != null ? result.percentage : result.total_marks > 0 ? (result.score / result.total_marks) * 100 : 0;
    return (
      <div className="max-w-lg mx-auto bg-white rounded-lg border border-brand-cream-dark shadow-sm p-8 text-center">
        <div className="text-2xl font-heading font-bold text-brand-brown-dark mb-2">Exam Submitted</div>
        <p className="text-sm text-brand-brown-light mb-5">You have already completed this exam. Retaking is not permitted.</p>
        <div className="bg-brand-cream rounded-xl p-6 inline-block min-w-[240px]">
          <div className="text-sm text-brand-brown-light mb-1">Your Score</div>
          <div className="text-4xl font-bold text-brand-brown-dark">{result.score}/{result.total_marks}</div>
          <div className="text-lg font-bold text-brand-brown mt-1">{pct.toFixed(1)}%</div>
        </div>
        {resultsUpdated && (
          <p className="text-xs text-success-700 mt-4">✓ This score has been saved to your results.</p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      <div className="flex justify-between items-center bg-white rounded-lg border border-brand-cream-dark shadow-sm p-4 sticky top-16 z-10">
        <div>
          <div className="font-heading font-bold text-brand-brown-dark">{exam?.title}</div>
          <div className="text-xs text-brand-brown-light">{exam?.class_name} · {exam?.subject_name}</div>
        </div>
        <div className="text-lg font-bold text-danger-700 bg-danger-700/10 rounded-lg px-3 py-1.5">⏱ {fmtTime(secondsLeft)}</div>
      </div>

      <div className="bg-warning-700/10 text-warning-700 text-xs rounded-lg p-3">Answer every question, then submit. You cannot retake this exam once submitted.</div>

      {questions.map((q, i) => (
        <div key={q.id} className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-5">
          <div className="font-medium text-brand-brown-dark mb-3">{i + 1}. {q.question_text}</div>
          <div className="flex flex-col gap-2">
            {(['A', 'B', 'C', 'D'] as const).map((letter) => {
              const text = { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d }[letter];
              if (!text) return null;
              const checked = answers[q.id] === letter;
              return (
                <label key={letter} className={`flex items-center gap-2 border rounded-md px-3 py-2 cursor-pointer text-sm ${checked ? 'border-brand-gold bg-brand-gold/10' : 'border-brand-cream-dark'}`}>
                  <input type="radio" name={q.id} checked={checked} onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: letter }))} />
                  <span className="font-semibold">{letter}.</span> {text}
                </label>
              );
            })}
          </div>
        </div>
      ))}

      {error && <div className="text-sm text-danger-700">{error}</div>}
      <button onClick={submit} disabled={submitting} className="bg-brand-brown text-white rounded-md px-5 py-3 font-medium self-start disabled:opacity-50">
        {submitting ? 'Submitting…' : 'Submit Exam'}
      </button>
    </div>
  );
}
