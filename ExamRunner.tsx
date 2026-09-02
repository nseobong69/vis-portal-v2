import { useEffect, useState } from 'react';
import Button from '../ui/Button';
import FaceCheckGate from './FaceCheckGate';

interface ExamMeta {
  id: string;
  title: string;
  duration_minutes?: number;
}

interface Question {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c?: string | null;
  option_d?: string | null;
}

interface Props {
  exam: ExamMeta;
  requiresCode: boolean;
  profileImageUrl?: string | null;
}

// Student-facing counterpart to admissions/AptitudeTest.tsx — same
// phase-machine shape, plus an access-code gate up front (ported from
// startExam()'s modal(), see verify-code.ts) and a hard "already
// submitted" stop instead of AptitudeTest's always-allowed retake
// (Admissions has no submission history to block against; a real
// student account does).
//
// CBT continuation, part 1: tab-switch / minimize detection with a
// voiced + on-screen countdown, auto-submit on expiry, and a violation
// log — ports _onExamVisChange/_forceExamSubmit from index.html. An
// invigilator can enter the school's PIN to cancel a countdown in
// progress (see verify-invigilator-pin.ts), same override the old app
// offered.
//
// CBT continuation, part 2: a camera-based identity check gates entry
// (see FaceCheckGate.tsx — now with real face-api.js liveness
// challenges and profile-photo matching, ported from the old app's
// verifyFaceAtExamStart) and periodic proctoring snapshots are taken
// every 5 minutes while the exam runs — both log to cbt_snapshots.
// Deliberately NOT ported: freeze-frame/still-image detection,
// microphone-based noise detection, and "intruder detected" (second-
// face) monitoring during the exam itself (distinct from the
// multiple-faces check at entry, which IS ported) — see
// FaceCheckGate.tsx's header comment for why these stay deferred.
const VIOLATION_COUNTDOWN_SECONDS = 4;

export default function ExamRunner({ exam, requiresCode, profileImageUrl }: Props) {
  const [phase, setPhase] = useState<
    'code' | 'facecheck' | 'intro' | 'loading' | 'running' | 'submitting' | 'done' | 'error'
  >(requiresCode ? 'code' : 'facecheck');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState((exam.duration_minutes || 30) * 60);
  const [result, setResult] = useState<{ score: number; total_marks: number; percentage: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tab-switch / minimize guard state.
  const [violationCountdown, setViolationCountdown] = useState<number | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const [showPinOverride, setShowPinOverride] = useState(false);
  const [invigilatorPin, setInvigilatorPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinChecking, setPinChecking] = useState(false);

  async function verifyCode() {
    setCodeError(null);
    try {
      const res = await fetch('/api/student/exams/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_id: exam.id, code: code.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Invalid access code.');
      setPhase('facecheck');
    } catch (e: any) {
      setCodeError(e?.message || 'Invalid access code.');
    }
  }

  async function start() {
    setPhase('loading');
    try {
      const res = await fetch('/api/student/exams/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_id: exam.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load the exam.');
      if (!json.questions?.length) throw new Error('No questions available for this exam.');
      setQuestions(json.questions);
      setPhase('running');
    } catch (e: any) {
      setError(e?.message || 'Could not load the exam.');
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

  // Periodic proctoring snapshots — ports the old app's window._snapTimers
  // (fires roughly every 5 minutes while the exam is running). Re-requests
  // the camera for each snapshot rather than holding one long-lived stream
  // across the whole exam — simpler, at the cost of a brief camera-on
  // flicker every interval; acceptable for a periodic check-in.
  useEffect(() => {
    if (phase !== 'running') return;
    let snapNumber = 0;
    const interval = setInterval(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
          audio: false,
        });
        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        await video.play();
        await new Promise((r) => setTimeout(r, 400)); // let a frame land
        const canvas = document.createElement('canvas');
        canvas.width = 240;
        canvas.height = 240;
        canvas.getContext('2d')!.drawImage(video, 0, 0, 240, 240);
        stream.getTracks().forEach((t) => t.stop());
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.5));
        if (!blob) return;

        const signRes = await fetch('/api/student/exams/sign-photo-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exam_id: exam.id }),
        });
        const sign = await signRes.json();
        if (!signRes.ok) return;

        const fd = new FormData();
        fd.append('file', blob);
        fd.append('folder', sign.folder);
        fd.append('public_id', sign.public_id);
        fd.append('api_key', sign.api_key);
        fd.append('signature', sign.signature);
        fd.append('timestamp', String(sign.timestamp));
        const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloud_name}/image/upload`, {
          method: 'POST',
          body: fd,
        });
        const uploadJson = await uploadRes.json();
        if (uploadJson.secure_url) {
          snapNumber += 1;
          fetch('/api/student/exams/log-snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exam_id: exam.id, image_url: uploadJson.secure_url, snap_number: snapNumber }),
          }).catch(() => {});
        }
      } catch {
        // Camera unavailable mid-exam (denied, in use elsewhere) — silent
        // fail, same "never interrupt the exam" posture as the old app.
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [phase, exam.id]);

  function logViolation(violationType: string, details?: string) {
    fetch('/api/student/exams/log-violation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exam_id: exam.id, violation_type: violationType, details }),
    }).catch(() => {
      // Best-effort — a logging failure shouldn't block the countdown/submit below.
    });
  }

  function speakWarning(text: string) {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-NG';
      u.rate = 1.1;
      window.speechSynthesis.speak(u);
    } catch {
      // speechSynthesis isn't available everywhere — silent no-op, same as index.html's try/catch.
    }
  }

  // Tab-switch / minimize detection — ports _onExamVisChange. Only armed
  // while a question is actively being answered ('running'); the
  // effect's own cleanup removes the listener the moment that's no
  // longer true, matching _detachExamGuards().
  useEffect(() => {
    if (phase !== 'running') return;
    function onVisibilityChange() {
      if (document.hidden) {
        setViolationCount((c) => c + 1);
        logViolation('tab_switch', 'visibilitychange: document hidden');
        speakWarning(`Do not switch tabs! Your exam will be auto-submitted in ${VIOLATION_COUNTDOWN_SECONDS} seconds.`);
        setViolationCountdown(VIOLATION_COUNTDOWN_SECONDS);
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [phase]);

  // Countdown ticker for an active violation — auto-submits at zero
  // unless the student returns AND an invigilator cancels it via PIN
  // (returning to the tab alone does not cancel it, same as the old
  // app: the countdown is a fixed 4s window regardless of visibility).
  useEffect(() => {
    if (violationCountdown === null) return;
    if (violationCountdown <= 0) {
      setViolationCountdown(null);
      if (phase === 'running') submit('Tab switch / minimize detected');
      return;
    }
    const t = setTimeout(() => setViolationCountdown((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [violationCountdown]);

  async function cancelViolationWithPin() {
    setPinError(null);
    setPinChecking(true);
    try {
      const res = await fetch('/api/student/exams/verify-invigilator-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_id: exam.id, pin: invigilatorPin.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.valid) throw new Error(json.error || 'Incorrect PIN.');
      setViolationCountdown(null);
      setShowPinOverride(false);
      setInvigilatorPin('');
    } catch (e: any) {
      setPinError(e?.message || 'Incorrect PIN.');
    } finally {
      setPinChecking(false);
    }
  }

  async function submit(forcedReason?: string) {
    setViolationCountdown(null);
    if (forcedReason) logViolation('auto_submit', forcedReason);
    setPhase('submitting');
    try {
      const res = await fetch('/api/student/exams/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_id: exam.id, answers }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not submit the exam.');
      setResult(json);
      setPhase('done');
    } catch (e: any) {
      setError(e?.message || 'Could not submit the exam.');
      setPhase('error');
    }
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  if (phase === 'code') {
    return (
      <div className="bg-brand-cream rounded-lg p-5 flex flex-col gap-3 max-w-md">
        <div className="font-bold text-brand-brown">Enter Your Access Code</div>
        <p className="text-sm text-brand-brown-light">
          Enter the personal access code sent to your email. This code is tied to your account — another
          student's code will be rejected.
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Access Code"
          className="border border-brand-cream-dark rounded-md px-3 py-2 text-center tracking-widest text-lg"
        />
        {codeError && <p className="text-danger-700 text-sm">{codeError}</p>}
        <Button onClick={verifyCode}>Enter Exam</Button>
      </div>
    );
  }

  if (phase === 'facecheck') {
    return <FaceCheckGate examId={exam.id} profileImageUrl={profileImageUrl ?? null} onCleared={() => setPhase('intro')} />;
  }

  if (phase === 'intro') {
    return (
      <div className="bg-brand-cream rounded-lg p-5 flex flex-col gap-4 max-w-md">
        <div className="font-bold text-brand-brown">{exam.title}</div>
        <ol className="list-decimal pl-5 text-sm text-brand-brown-light flex flex-col gap-1">
          <li>Click "Start Exam" to begin.</li>
          <li>Answer all questions within {exam.duration_minutes || 30} minutes.</li>
          <li>Your score is recorded automatically on submit.</li>
          <li>No retakes once submitted.</li>
        </ol>
        <Button onClick={start}>Start Exam</Button>
      </div>
    );
  }

  if (phase === 'loading') {
    return <div className="text-sm text-brand-brown-light">Loading exam…</div>;
  }

  if (phase === 'error') {
    return (
      <div className="bg-danger-soft text-danger-700 rounded-md p-4 text-sm flex flex-col gap-3 max-w-md">
        <span>{error}</span>
      </div>
    );
  }

  if (phase === 'submitting') {
    return <div className="text-sm text-brand-brown-light">Submitting your answers…</div>;
  }

  if (phase === 'done' && result) {
    return (
      <div className="rounded-lg p-5 border-2 border-success-700 bg-success-soft max-w-md">
        <div className="text-xs font-bold uppercase tracking-wide mb-1">Exam Completed</div>
        <div className="text-4xl font-extrabold">{result.percentage}%</div>
        <div className="text-sm mt-1">Score: {result.score}/{result.total_marks}</div>
        <a href="/student/exams" className="inline-block mt-3 text-sm font-medium text-brand-brown underline">
          Back to exams
        </a>
      </div>
    );
  }

  const q = questions[idx];
  const opts = [
    ['A', q.option_a], ['B', q.option_b], ['C', q.option_c], ['D', q.option_d],
  ].filter(([, text]) => !!text) as [string, string][];

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      {violationCountdown !== null && (
        <div className="rounded-md border-2 border-danger-700 bg-danger-soft p-4 flex flex-col gap-2">
          <div className="font-bold text-danger-700">
            ⚠️ Do not leave the exam tab! Auto-submitting in {violationCountdown}s
            {violationCount > 1 ? ` (violation #${violationCount})` : ''}.
          </div>
          {!showPinOverride ? (
            <button
              type="button"
              className="text-xs font-medium text-danger-700 underline text-left w-fit"
              onClick={() => setShowPinOverride(true)}
            >
              I'm an invigilator — enter PIN to cancel
            </button>
          ) : (
            <div className="flex flex-col gap-2 max-w-xs">
              <input
                type="password"
                value={invigilatorPin}
                onChange={(e) => setInvigilatorPin(e.target.value)}
                placeholder="Invigilator PIN"
                maxLength={8}
                className="border border-brand-cream-dark rounded-md px-3 py-1.5 text-center tracking-widest text-sm"
              />
              {pinError && <p className="text-danger-700 text-xs">{pinError}</p>}
              <Button size="sm" variant="secondary" disabled={pinChecking} onClick={cancelViolationWithPin}>
                {pinChecking ? 'Checking…' : 'Authorise & Continue'}
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-brand-brown">Question {idx + 1} of {questions.length}</span>
        <span className="text-sm font-bold text-danger-700 bg-danger-soft px-3 py-1 rounded-md">⏱ {mm}:{ss}</span>
      </div>
      <div className="font-medium text-brand-brown-dark">{q.question_text}</div>
      <div className="flex flex-col gap-2">
        {opts.map(([letter, text]) => (
          <label
            key={letter}
            className={`flex items-center gap-3 px-4 py-3 border-2 rounded-md cursor-pointer ${
              answers[q.id] === letter ? 'border-brand-brown bg-brand-cream' : 'border-brand-cream-dark'
            }`}
          >
            <input
              type="radio"
              name={`q-${q.id}`}
              checked={answers[q.id] === letter}
              onChange={() => setAnswers((a) => ({ ...a, [q.id]: letter }))}
            />
            <span className="text-sm">{text}</span>
          </label>
        ))}
      </div>
      <div className="flex justify-between mt-2">
        <Button variant="secondary" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>Previous</Button>
        {idx < questions.length - 1 ? (
          <Button onClick={() => setIdx((i) => i + 1)}>Next Question</Button>
        ) : (
          <Button onClick={() => submit()}>Submit Exam</Button>
        )}
      </div>
    </div>
  );
}
