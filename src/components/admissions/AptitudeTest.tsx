import { useEffect, useState } from 'react';
import Button from '../ui/Button';

interface ExamMeta {
  id: string;
  title: string;
  duration_minutes?: number;
  total_questions?: number;
}

interface Question {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c?: string | null;
  option_d?: string | null;
  order_index: number;
}

interface Props {
  exam: ExamMeta;
  applicantName: string;
  onComplete: (result: { score: number; total_marks: number; percentage: number }) => void;
}

const PASS_THRESHOLD = 65;

export default function AptitudeTest({ exam, applicantName, onComplete }: Props) {
  const [phase, setPhase] = useState<'intro' | 'loading' | 'running' | 'submitting' | 'done' | 'error'>('intro');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState((exam.duration_minutes || 30) * 60);
  const [result, setResult] = useState<{ score: number; total_marks: number; percentage: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPhase('loading');
    try {
      const res = await fetch('/api/admissions/cbt-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_id: exam.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.questions?.length) throw new Error(json.error || 'No questions available for this test.');
      setQuestions(json.questions);
      setPhase('running');
    } catch (e: any) {
      setError(e?.message || 'Could not load the test.');
      setPhase('error');
    }
  }

  useEffect(() => {
    if (phase !== 'running') return;
    if (secondsLeft <= 0) {
      submit();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, secondsLeft]);

  async function submit() {
    setPhase('submitting');
    try {
      const res = await fetch('/api/admissions/cbt-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_id: exam.id, answers, applicant_name: applicantName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not submit the test.');
      setResult(json);
      setPhase('done');
      onComplete(json);
    } catch (e: any) {
      setError(e?.message || 'Could not submit the test.');
      setPhase('error');
    }
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  if (phase === 'intro') {
    return (
      <div className="bg-[#F5F3FF] rounded-lg p-5 flex flex-col gap-4">
        <div className="font-bold text-[#6D28D9]">{exam.title}</div>
        <ol className="list-decimal pl-5 text-sm text-[#4C1D95] flex flex-col gap-1">
          <li>Click "Take Test" to start the aptitude test.</li>
          <li>Answer all questions within the time limit ({exam.duration_minutes || 30} minutes).</li>
          <li>Your score is recorded automatically on submit.</li>
          <li>Score ≥{PASS_THRESHOLD}% is treated as a strong pass for admission review.</li>
        </ol>
        <Button onClick={start} className="bg-[#7C3AED] hover:brightness-110">Take Aptitude Test Now</Button>
      </div>
    );
  }

  if (phase === 'loading') {
    return <div className="text-sm text-brand-brown-light">Loading test…</div>;
  }

  if (phase === 'error') {
    return (
      <div className="bg-danger-soft text-danger-700 rounded-md p-4 text-sm flex flex-col gap-3">
        <span>{error}</span>
        <Button variant="secondary" onClick={start}>Try again</Button>
      </div>
    );
  }

  if (phase === 'submitting') {
    return <div className="text-sm text-brand-brown-light">Submitting your answers…</div>;
  }

  if (phase === 'done' && result) {
    const passed = result.percentage >= PASS_THRESHOLD;
    return (
      <div className={`rounded-lg p-5 border-2 ${passed ? 'bg-success-soft border-success-700' : 'bg-warning-soft border-warning-700'}`}>
        <div className="text-xs font-bold uppercase tracking-wide mb-1">Test Completed</div>
        <div className="text-4xl font-extrabold">{result.percentage}%</div>
        <div className="text-sm mt-1">Score: {result.score}/{result.total_marks}</div>
        <div className="text-sm mt-2">
          {passed
            ? 'Great result — this will be reviewed as part of your application.'
            : 'Your score has been recorded and will be reviewed as part of your application.'}
        </div>
      </div>
    );
  }

  const q = questions[idx];
  const opts = [
    ['A', q.option_a], ['B', q.option_b], ['C', q.option_c], ['D', q.option_d],
  ].filter(([, text]) => !!text) as [string, string][];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-brand-brown">Question {idx + 1} of {questions.length}</span>
        <span className="text-sm font-bold text-danger-700 bg-danger-soft px-3 py-1 rounded-md">⏱ {mm}:{ss}</span>
      </div>
      <div className="font-medium text-brand-brown-dark">{q.question_text}</div>
      <div className="flex flex-col gap-2">
        {opts.map(([letter, text]) => (
          <label key={letter}
            className={`flex items-center gap-3 px-4 py-3 border-2 rounded-md cursor-pointer ${answers[q.id] === letter ? 'border-[#7C3AED] bg-[#F5F3FF]' : 'border-brand-cream-dark'}`}>
            <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === letter}
              onChange={() => setAnswers((a) => ({ ...a, [q.id]: letter }))} />
            <span className="text-sm">{text}</span>
          </label>
        ))}
      </div>
      <div className="flex justify-between mt-2">
        <Button variant="secondary" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>Previous</Button>
        {idx < questions.length - 1 ? (
          <Button onClick={() => setIdx((i) => i + 1)}>Next Question</Button>
        ) : (
          <Button className="bg-[#7C3AED] hover:brightness-110" onClick={submit}>Submit Test</Button>
        )}
      </div>
    </div>
  );
}
