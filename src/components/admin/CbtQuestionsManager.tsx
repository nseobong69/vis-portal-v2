import { useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';

interface Question {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string | null;
  option_d: string | null;
  correct_answer: string;
  marks: number;
}
interface Props {
  examId: string;
  questions: Question[];
}

const OPT_LETTERS = ['A', 'B', 'C', 'D'] as const;

function emptyForm() {
  return { questionText: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'A' as 'A' | 'B' | 'C' | 'D' };
}

export default function CbtQuestionsManager({ examId, questions }: Props) {
  const [list, setList] = useState(questions);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function callAPI(payload: object) {
    const res = await fetch('/api/admin/cbt/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }

  async function refreshMarks() {
    // After add/delete the server redistributes marks to 100/n; simplest
    // correct reflection client-side is to recompute the same way rather
    // than re-fetch the whole list.
    setList((prev) => {
      const marksEach = parseFloat((100 / (prev.length || 1)).toFixed(4));
      return prev.map((q) => ({ ...q, marks: marksEach }));
    });
  }

  async function handleAddOrUpdate() {
    if (!form.questionText.trim() || !form.optionA.trim() || !form.optionB.trim()) {
      setError('Question text and at least options A and B are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await callAPI({ action: 'update', id: editingId, ...form });
        setList((prev) => prev.map((q) => (q.id === editingId ? { ...q, question_text: form.questionText, option_a: form.optionA, option_b: form.optionB, option_c: form.optionC || null, option_d: form.optionD || null, correct_answer: form.correctAnswer } : q)));
        setEditingId(null);
      } else {
        const data = await callAPI({ action: 'add', examId, ...form });
        setList((prev) => [...prev, data.question]);
        await refreshMarks();
      }
      setForm(emptyForm());
    } catch (e: any) {
      setError(e.message || 'Could not save question.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(q: Question) {
    setEditingId(q.id);
    setForm({
      questionText: q.question_text,
      optionA: q.option_a,
      optionB: q.option_b,
      optionC: q.option_c || '',
      optionD: q.option_d || '',
      correctAnswer: q.correct_answer as any,
    });
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this question?')) return;
    try {
      await callAPI({ action: 'delete', id, examId });
      setList((prev) => prev.filter((q) => q.id !== id));
      await refreshMarks();
    } catch (e: any) {
      alert(e.message || 'Could not delete.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-5 flex flex-col gap-3">
        <div className="font-heading font-bold text-brand-brown-dark">{editingId ? 'Edit Question' : 'Add Question'}</div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-brand-brown-dark">Question Text</label>
          <textarea
            rows={2}
            value={form.questionText}
            onChange={(e) => setForm((f) => ({ ...f, questionText: e.target.value }))}
            className="font-body text-sm rounded-sm border border-brand-cream-dark px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-brand-gold"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input id="q-a" label="Option A" value={form.optionA} onChange={(e) => setForm((f) => ({ ...f, optionA: e.target.value }))} />
          <Input id="q-b" label="Option B" value={form.optionB} onChange={(e) => setForm((f) => ({ ...f, optionB: e.target.value }))} />
          <Input id="q-c" label="Option C (optional)" value={form.optionC} onChange={(e) => setForm((f) => ({ ...f, optionC: e.target.value }))} />
          <Input id="q-d" label="Option D (optional)" value={form.optionD} onChange={(e) => setForm((f) => ({ ...f, optionD: e.target.value }))} />
        </div>
        <Select id="q-correct" label="Correct Answer" options={OPT_LETTERS.map((l) => ({ value: l, label: l }))} value={form.correctAnswer} onChange={(e) => setForm((f) => ({ ...f, correctAnswer: e.target.value as any }))} />
        {error && <div className="text-sm text-danger-700">{error}</div>}
        <div className="flex gap-2">
          <Button variant="primary" onClick={handleAddOrUpdate} disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Update Question' : 'Add Question'}
          </Button>
          {editingId && (
            <Button variant="secondary" onClick={() => { setEditingId(null); setForm(emptyForm()); }}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="text-sm text-brand-brown-light">{list.length} question(s) · {list[0]?.marks ? `${list[0].marks} mark(s) each (auto-distributed to 100%)` : ''}</div>

      <div className="flex flex-col gap-3">
        {list.length === 0 && (
          <div className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-9 text-center text-brand-brown-light">
            No questions yet — add one above.
          </div>
        )}
        {list.map((q, i) => (
          <div key={q.id} className="bg-white rounded-lg border border-brand-cream-dark shadow-sm p-4">
            <div className="flex justify-between items-start gap-3">
              <div className="font-medium text-brand-brown-dark">{i + 1}. {q.question_text}</div>
              <div className="flex gap-3 shrink-0">
                <button onClick={() => startEdit(q)} className="text-brand-brown text-xs hover:underline">Edit</button>
                <button onClick={() => handleDelete(q.id)} className="text-danger-700 text-xs hover:underline">Delete</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-2 text-sm">
              {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                const text = { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d }[letter];
                if (!text) return null;
                const isCorrect = q.correct_answer === letter;
                return (
                  <div key={letter} className={`px-2 py-1 rounded ${isCorrect ? 'bg-success-700/10 text-success-700 font-semibold' : 'text-body'}`}>
                    {letter}. {text} {isCorrect && '✓'}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
