import { useState } from 'react';

// Ported from renderAptitudeTests() / manageAptQs() / showAddAptQModal() /
// showBulkAptQBoxes() / saveAptBulkQuestions() / activateAptitudeExam() /
// deactivateAptitudeExam() / deleteCBT() (index.html ~L11024-11260).
// Table: cbt_exams (exam_type='aptitude'), cbt_questions.

interface Exam {
  id: string;
  title: string;
  class_name: string;
  duration_minutes: number;
  total_questions: number;
  status: 'draft' | 'active' | 'completed';
  session: string;
}

interface Question {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string | null;
  option_d: string | null;
  correct_answer: string;
  order_index: number;
}

interface Props {
  initialExams: Exam[];
  classes: { id: string; name: string }[];
}

// Mirrors getPreviousClassForApt() (index.html ~L10993)
function getPrevClass(cls: string): string | null {
  if (!cls) return null;
  const c = cls.toLowerCase().replace(/\s+/g, '');
  if (/ss3|sss3/.test(c)) return 'SSS 2';
  if (/ss2|sss2/.test(c)) return 'SSS 1';
  if (/ss1|sss1/.test(c)) return 'JSS 3';
  if (/jss3/.test(c)) return 'JSS 2';
  if (/jss2/.test(c)) return 'JSS 1';
  if (/jss1/.test(c)) return 'Primary 5 or 6';
  if (/pry6|primary6/.test(c)) return 'Primary 5';
  if (/pry5|primary5/.test(c)) return 'Primary 4';
  if (/pry4|primary4/.test(c)) return 'Primary 3';
  if (/pry3|primary3/.test(c)) return 'Primary 2';
  if (/pry2|primary2/.test(c)) return 'Primary 1';
  if (/pry1|primary1/.test(c)) return 'Nursery 2';
  if (/nursery2|nur2/.test(c)) return 'Nursery 1';
  if (/nursery1|nur1/.test(c)) return 'Upper KG';
  return null;
}

const SESSIONS = ['2024/2025', '2025/2026', '2026/2027', '2027/2028'];
const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-brand-cream text-brand-brown-dark',
  active: 'bg-success-700/10 text-success-700',
  completed: 'bg-brand-cream text-brand-brown-light',
};

async function api(method: string, body: object) {
  const res = await fetch('/api/admin/aptitude-tests/action', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

export default function AptitudeTests({ initialExams, classes }: Props) {
  const [exams, setExams] = useState<Exam[]>(initialExams);
  const [view, setView] = useState<'list' | 'questions'>('list');
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qLoading, setQLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddQ, setShowAddQ] = useState(false);
  const [qCount, setQCount] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create form state
  const [cTitle, setCTitle] = useState('');
  const [cClass, setCClass] = useState('');
  const [cDur, setCDur] = useState('45');
  const [cSess, setCSess] = useState(SESSIONS[1]);
  const [cInst, setCInst] = useState('');
  const [creating, setCreating] = useState(false);

  // Deduplicate classes by base name, exclude kindergarten
  const seen = new Set<string>();
  const classOpts = classes.filter((c) => {
    if (/kindergarten|kinder|kg|k\.g/i.test(c.name)) return false;
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  async function handleCreate() {
    if (!cTitle.trim()) { setError('Enter a test title.'); return; }
    if (!cClass) { setError('Select a class.'); return; }
    setCreating(true); setError('');
    try {
      const data = await api('POST', {
        action: 'create',
        title: cTitle.trim(), class_name: cClass,
        duration_minutes: parseInt(cDur) || 45, session: cSess, instructions: cInst,
      });
      setExams((prev) => [data.exam, ...prev]);
      setShowCreate(false);
      setCTitle(''); setCClass(''); setCDur('45'); setCInst('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create.');
    } finally { setCreating(false); }
  }

  async function handleActivate(id: string) {
    setBusyId(id);
    try {
      await api('POST', { action: 'activate', id });
      setExams((prev) => prev.map((e) => e.id === id ? { ...e, status: 'active' } : e));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed.'); }
    finally { setBusyId(null); }
  }

  async function handleDeactivate(id: string) {
    setBusyId(id);
    try {
      await api('POST', { action: 'deactivate', id });
      setExams((prev) => prev.map((e) => e.id === id ? { ...e, status: 'completed' } : e));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed.'); }
    finally { setBusyId(null); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this exam and all questions? This cannot be undone.')) return;
    setBusyId(id);
    try {
      await api('DELETE', { id });
      setExams((prev) => prev.filter((e) => e.id !== id));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed.'); }
    finally { setBusyId(null); }
  }

  async function openQuestions(exam: Exam) {
    setActiveExam(exam);
    setView('questions');
    setQLoading(true);
    try {
      const data = await api('POST', { action: 'getQuestions', examId: exam.id });
      setQuestions(data.questions);
    } finally { setQLoading(false); }
  }

  async function handleDeleteQ(qId: string) {
    if (!activeExam || !confirm('Delete this question?')) return;
    try {
      await api('DELETE', { id: qId, type: 'question', examId: activeExam.id });
      setQuestions((prev) => prev.filter((q) => q.id !== qId));
      setExams((prev) => prev.map((e) => e.id === activeExam.id
        ? { ...e, total_questions: Math.max(0, (e.total_questions || 0) - 1) } : e));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed.'); }
  }

  // ── Bulk add questions form state ──
  const [bulkForms, setBulkForms] = useState<{ txt: string; a: string; b: string; c: string; d: string; ans: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  function openBulkAdd(count: number) {
    setBulkForms(Array.from({ length: count }, () => ({ txt: '', a: '', b: '', c: '', d: '', ans: 'A' })));
    setQCount(count);
    setShowAddQ(false);
  }

  function updateBulk(i: number, field: string, val: string) {
    setBulkForms((prev) => prev.map((f, idx) => idx === i ? { ...f, [field]: val } : f));
  }

  async function saveBulkQuestions() {
    if (!activeExam) return;
    setSaving(true); setSaveStatus('');
    try {
      const qs = bulkForms
        .filter((f) => f.txt.trim() && f.a.trim() && f.b.trim())
        .map((f) => ({ question_text: f.txt.trim(), option_a: f.a.trim(), option_b: f.b.trim(), option_c: f.c.trim() || null, option_d: f.d.trim() || null, correct_answer: f.ans }));
      if (!qs.length) { setSaveStatus('No complete questions to save.'); setSaving(false); return; }
      const data = await api('POST', { action: 'saveQuestions', examId: activeExam.id, questions: qs });
      setQuestions(data.questions);
      setExams((prev) => prev.map((e) => e.id === activeExam.id ? { ...e, total_questions: data.questions.length } : e));
      setActiveExam((prev) => prev ? { ...prev, total_questions: data.questions.length } : null);
      setQCount(null); setBulkForms([]);
    } catch (e) {
      setSaveStatus(e instanceof Error ? e.message : 'Save failed.');
    } finally { setSaving(false); }
  }

  // ── QUESTIONS VIEW ──
  if (view === 'questions' && activeExam) {
    const total = questions.length;
    const marksEach = total > 0 ? parseFloat((100 / total).toFixed(2)) : 0;

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <button onClick={() => { setView('list'); setQCount(null); setBulkForms([]); }} className="text-sm text-brand-brown-light hover:text-brand-brown-dark">← Back</button>
            <h2 className="font-heading font-bold text-lg text-brand-brown-dark mt-1">Aptitude: {activeExam.title}</h2>
            <p className="text-xs text-brand-brown-light">{total} questions · {marksEach} marks each (auto)</p>
          </div>
          <button onClick={() => setShowAddQ(true)} className="px-4 py-2 rounded-md text-white text-sm font-semibold" style={{ background: '#7C3AED' }}>
            + Add Questions
          </button>
        </div>

        {/* Add Q count picker */}
        {showAddQ && (
          <div className="rounded-md border border-brand-cream-dark bg-white p-5">
            <div className="font-semibold text-sm mb-3" style={{ color: '#5B21B6' }}>How many questions to add?</div>
            <div className="flex flex-wrap gap-2 mb-3">
              {[1, 2, 3, 5, 10, 15, 20].map((n) => (
                <button key={n} onClick={() => openBulkAdd(n)} className="w-12 h-10 rounded-md border border-brand-cream-dark font-bold text-sm hover:bg-brand-cream">{n}</button>
              ))}
            </div>
            <button onClick={() => setShowAddQ(false)} className="text-xs text-brand-brown-light hover:underline">Cancel</button>
          </div>
        )}

        {/* Bulk question forms */}
        {qCount !== null && bulkForms.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="rounded-md bg-purple-50 border border-purple-200 px-4 py-2 text-xs text-purple-700">
              Marks per question are auto-calculated (100% shared equally). No marks field needed.
            </div>
            {bulkForms.map((f, i) => (
              <div key={i} className="rounded-md border-2 border-purple-200 bg-purple-50/30 p-4">
                <div className="font-bold text-sm mb-3" style={{ color: '#5B21B6' }}>
                  <span className="bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full mr-2">Q{i + 1}</span>
                  Question {i + 1}
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-xs font-medium text-brand-brown-dark block mb-1">Question Text</label>
                    <textarea value={f.txt} onChange={(e) => updateBulk(i, 'txt', e.target.value)} rows={2} placeholder="Type the question here…" className="w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2 bg-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {['a', 'b', 'c', 'd'].map((opt) => (
                      <div key={opt}>
                        <label className="text-xs font-medium text-brand-brown-dark block mb-1">Option {opt.toUpperCase()}{opt === 'a' || opt === 'b' ? ' *' : ' (optional)'}</label>
                        <input value={(f as any)[opt]} onChange={(e) => updateBulk(i, opt, e.target.value)} placeholder={`Option ${opt.toUpperCase()}`} className="w-full text-sm rounded-sm border border-brand-cream-dark px-2 py-1.5 bg-white" />
                      </div>
                    ))}
                  </div>
                  <div className="max-w-[160px]">
                    <label className="text-xs font-medium text-brand-brown-dark block mb-1">Correct Answer</label>
                    <select value={f.ans} onChange={(e) => updateBulk(i, 'ans', e.target.value)} className="w-full text-sm rounded-sm border border-brand-cream-dark px-2 py-1.5 bg-white">
                      <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
            {saveStatus && <p className="text-xs text-danger-700">{saveStatus}</p>}
            <div className="flex gap-2">
              <button onClick={saveBulkQuestions} disabled={saving} className="flex-1 py-3 rounded-md text-white font-semibold text-sm disabled:opacity-60" style={{ background: '#7C3AED' }}>
                {saving ? 'Saving…' : `Save All ${bulkForms.length} Question${bulkForms.length > 1 ? 's' : ''}`}
              </button>
              <button onClick={() => { setQCount(null); setBulkForms([]); setShowAddQ(true); }} className="px-4 py-3 rounded-md border border-brand-cream-dark text-sm">← Back</button>
            </div>
          </div>
        )}

        {/* Questions list */}
        {qLoading ? (
          <div className="text-center text-brand-brown-light py-8">Loading questions…</div>
        ) : questions.length === 0 && qCount === null ? (
          <div className="rounded-md border border-brand-cream-dark bg-white p-10 text-center">
            <div className="text-4xl mb-3">❓</div>
            <div className="font-bold text-brand-brown-dark mb-3">No questions yet</div>
            <button onClick={() => setShowAddQ(true)} className="px-4 py-2 rounded-md text-white text-sm font-semibold" style={{ background: '#7C3AED' }}>+ Add First Question</button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-md bg-purple-50 border border-purple-200 px-4 py-2 text-xs text-purple-700">
              Auto-scoring: {total} question{total !== 1 ? 's' : ''} → each worth {marksEach} marks (totals 100%).
            </div>
            {questions.map((q, i) => (
              <div key={q.id} className="rounded-md border-l-4 bg-white border border-brand-cream-dark p-4" style={{ borderLeftColor: '#7C3AED' }}>
                <div className="flex justify-between items-start gap-3 mb-3">
                  <div className="font-semibold text-sm" style={{ color: '#5B21B6' }}>{i + 1}. {q.question_text}</div>
                  <button onClick={() => handleDeleteQ(q.id)} className="w-7 h-7 rounded-md bg-danger-700/10 text-danger-700 flex items-center justify-center shrink-0">🗑</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(['a', 'b', 'c', 'd'] as const).filter((o) => (q as any)[`option_${o}`]).map((o) => (
                    <div key={o} className="rounded-md px-3 py-2 text-xs font-medium" style={{
                      background: q.correct_answer === o.toUpperCase() ? '#EDE9FE' : '#F9F5F0',
                      color: q.correct_answer === o.toUpperCase() ? '#5B21B6' : '#5D4037',
                      border: `1.5px solid ${q.correct_answer === o.toUpperCase() ? '#7C3AED' : 'transparent'}`,
                    }}>
                      <b>{o.toUpperCase()}.</b> {(q as any)[`option_${o}`]}
                      {q.correct_answer === o.toUpperCase() && ' ✓'}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── MAIN LIST VIEW ──
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-heading font-bold text-2xl text-brand-brown-dark">Aptitude Tests</h1>
          <p className="text-sm text-brand-brown-light">Create and manage admission aptitude tests</p>
        </div>
        <button onClick={() => { setShowCreate(true); setError(''); }} className="px-4 py-2 rounded-md bg-brand-brown-dark text-white text-sm font-semibold hover:brightness-110">
          + Create Aptitude Test
        </button>
      </div>

      <div className="rounded-md bg-purple-50 border border-purple-200 px-4 py-3 text-xs text-purple-700">
        Aptitude tests are auto-assigned to applicants based on the class they are applying for. No access code is required — applicants take the test directly from the admission form. Score ≥65% triggers auto-admission.
      </div>

      {error && <p className="text-sm text-danger-700">{error}</p>}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-bold text-lg" style={{ color: '#5B21B6' }}>🎓 Create Aptitude Test</h2>
              <button onClick={() => setShowCreate(false)} className="text-2xl text-brand-brown-light">×</button>
            </div>
            <div className="rounded-md bg-purple-50 border border-purple-200 px-3 py-2 text-xs text-purple-700">
              No access code or marks per question needed. Score is auto-calculated as 100% distributed equally. Applicants take this test directly from the public admission form.
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-brand-brown-dark block mb-1">Test Title</label>
                <input value={cTitle} onChange={(e) => setCTitle(e.target.value)} placeholder="e.g. JSS 1 Entrance Aptitude Test" className="w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2" />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-brown-dark block mb-1">Class Applying For</label>
                <select value={cClass} onChange={(e) => setCClass(e.target.value)} className="w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2">
                  <option value="">Select Class</option>
                  {classOpts.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                {cClass && getPrevClass(cClass) && (
                  <div className="text-xs mt-1" style={{ color: '#7C3AED' }}>Previous class level: <strong>{getPrevClass(cClass)}</strong></div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-brand-brown-dark block mb-1">Duration (minutes)</label>
                  <input type="number" min={5} value={cDur} onChange={(e) => setCDur(e.target.value)} className="w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2" />
                </div>
                <div>
                  <label className="text-xs font-medium text-brand-brown-dark block mb-1">Session</label>
                  <select value={cSess} onChange={(e) => setCSess(e.target.value)} className="w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2">
                    {SESSIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-brand-brown-dark block mb-1">Instructions (optional)</label>
                <textarea value={cInst} onChange={(e) => setCInst(e.target.value)} rows={2} placeholder="Instructions for applicants…" className="w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2" />
              </div>
            </div>
            {error && <p className="text-sm text-danger-700">{error}</p>}
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={creating} className="flex-1 py-3 rounded-md text-white font-semibold disabled:opacity-60" style={{ background: '#7C3AED' }}>
                {creating ? 'Creating…' : '✓ Create Test'}
              </button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-3 rounded-md border border-brand-cream-dark text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Exam cards */}
      {exams.length === 0 ? (
        <div className="rounded-md border border-brand-cream-dark bg-white p-12 text-center">
          <div className="text-5xl mb-4">🎓</div>
          <div className="font-bold text-xl text-brand-brown-dark mb-4">No aptitude tests yet</div>
          <button onClick={() => { setShowCreate(true); setError(''); }} className="px-5 py-2.5 rounded-md text-white font-semibold" style={{ background: '#7C3AED' }}>
            + Create First Aptitude Test
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {exams.map((e) => {
            const prev = getPrevClass(e.class_name);
            const busy = busyId === e.id;
            return (
              <div key={e.id} className="rounded-md border border-brand-cream-dark bg-white p-5">
                <div className="flex justify-between items-start mb-3 gap-2">
                  <div className="font-heading font-bold text-[15px] flex-1" style={{ color: '#5B21B6', lineHeight: 1.3 }}>{e.title}</div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${STATUS_BADGE[e.status] ?? STATUS_BADGE.draft}`}>{e.status}</span>
                </div>
                <div className="flex flex-col gap-1 mb-4 text-xs text-brand-brown-light">
                  <div>→ Class Applying For: <strong className="text-brand-brown-dark">{e.class_name || '—'}</strong></div>
                  {prev && <div>← Previous Level: <strong className="text-brand-brown-dark">{prev}</strong></div>}
                  <div>⏱ {e.duration_minutes} min · {e.total_questions || 0} questions · Auto-scored 100%</div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => openQuestions(e)} className="flex-1 text-center text-xs font-semibold px-3 py-2 rounded-md border border-brand-cream-dark hover:bg-brand-cream">
                    ❓ Questions
                  </button>
                  {e.status === 'draft' && (
                    <button onClick={() => handleActivate(e.id)} disabled={busy} className="text-xs font-semibold px-3 py-2 rounded-md bg-success-700/10 text-success-700 disabled:opacity-50">
                      ▶ Activate
                    </button>
                  )}
                  {e.status === 'active' && (
                    <button onClick={() => handleDeactivate(e.id)} disabled={busy} className="text-xs font-semibold px-3 py-2 rounded-md bg-danger-700/10 text-danger-700 disabled:opacity-50">
                      ⏹ Deactivate
                    </button>
                  )}
                  <button onClick={() => handleDelete(e.id)} disabled={busy} className="text-xs font-semibold px-3 py-2 rounded-md bg-danger-700 text-white disabled:opacity-50">
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
