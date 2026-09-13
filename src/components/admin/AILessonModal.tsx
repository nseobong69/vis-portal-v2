import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';

const TERMS = ['1st Term', '2nd Term', '3rd Term'];

export default function AILessonModal({ defaultSession, defaultTerm, onClose }: { defaultSession: string; defaultTerm: string; onClose: () => void }) {
  const [panel, setPanel] = useState<'form' | 'loading' | 'result'>('form');
  const [subject, setSubject] = useState('');
  const [className, setClassName] = useState('');
  const [topic, setTopic] = useState('');
  const [duration, setDuration] = useState('');
  const [sex, setSex] = useState('Mixed');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [term, setTerm] = useState(defaultTerm || TERMS[0]);
  const [session, setSession] = useState(defaultSession || '2024/2025');
  const [objectives, setObjectives] = useState('');
  const [extra, setExtra] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (!subject.trim() || !className.trim() || !topic.trim()) {
      setError('Subject, Class and Topic are required.');
      return;
    }
    setError('');
    setPanel('loading');
    try {
      const res = await fetch('/api/admin/academics/generate-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, class_name: className, topic, duration, sex, date, term, session, objectives, extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI generation failed.');
      setNote(data.note);
      setPanel('result');
    } catch (e: any) {
      setPanel('form');
      setError(e.message || 'AI generation failed.');
    }
  }

  async function copy() {
    if (!note) return;
    try {
      await navigator.clipboard.writeText(note);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older mobile browsers, same as copyAINote()
      const ta = document.getElementById('ai-result-content') as HTMLTextAreaElement | null;
      ta?.select();
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <Modal open onClose={onClose} title="🤖 AI Lesson Note Generator">
      <div className="min-w-[280px] max-w-[600px]">
        <p className="text-[11.5px] text-brand-brown-light -mt-3 mb-4">Powered by Groq · Free · Instant</p>

        {panel === 'form' && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-brand-brown-light -mt-1">Fill in the details. AI will generate a complete, formatted lesson note.</p>
            <div className="grid grid-cols-2 gap-3">
              <Input id="ai-subject" label="Subject *" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. English Language" />
              <Input id="ai-class" label="Class *" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="e.g. JSS 2" />
              <div className="col-span-2">
                <Input id="ai-topic" label="Topic *" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Parts of Speech – Nouns" />
              </div>
              <Input id="ai-duration" label="Duration" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 40 minutes" />
              <Select id="ai-sex" label="Sex" value={sex} onChange={(e) => setSex(e.target.value)} options={[{ value: 'Mixed', label: 'Mixed' }, { value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }]} />
              <Input id="ai-date" label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <Select id="ai-term" label="Term" value={term} onChange={(e) => setTerm(e.target.value)} options={TERMS.map((t) => ({ value: t, label: t }))} />
              <div className="col-span-2">
                <Input id="ai-session" label="Session" value={session} onChange={(e) => setSession(e.target.value)} placeholder="e.g. 2024/2025" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-brand-brown-dark block mb-1">Objectives <span className="font-normal text-brand-brown-light">(optional)</span></label>
                <textarea className="w-full rounded border border-brand-cream-dark px-3 py-2 text-sm font-mono" rows={3} value={objectives} onChange={(e) => setObjectives(e.target.value)} placeholder={'e.g.\n1. Define and identify types of nouns\n2. Use nouns correctly in sentences'} />
              </div>
              <div className="col-span-2">
                <Input id="ai-extra" label="Extra Instructions (optional)" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. Include a group activity" />
              </div>
            </div>
            {error && <div className="text-sm text-danger-700">{error}</div>}
            <button onClick={generate} className="w-full py-3 rounded-lg font-bold text-white mt-1" style={{ background: 'linear-gradient(135deg,#5D4037,#7C3AED)' }}>
              ✨ Generate Lesson Note
            </button>
          </div>
        )}

        {panel === 'loading' && (
          <div className="text-center py-14">
            <div className="text-4xl mb-3">🤖</div>
            <div className="font-bold text-brand-brown-dark mb-1.5">Generating your lesson note…</div>
            <div className="text-sm text-brand-brown-light">Usually takes 5–10 seconds</div>
          </div>
        )}

        {panel === 'result' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-success-700">✅ Generated! Copy and paste into Lesson Notes.</div>
              <button onClick={() => setPanel('form')} className="text-xs px-3 py-1.5 rounded-md bg-brand-cream text-brand-brown-dark">↺ Redo</button>
            </div>
            <div className="bg-warning-soft border border-warning-700/40 rounded-lg px-3.5 py-2.5 text-xs text-warning-700">
              ℹ️ Copy the note below, then go to <strong>Lesson Notes → + Lesson Note</strong> and paste it into the content field.
            </div>
            <textarea id="ai-result-content" readOnly rows={16} className="w-full rounded border border-brand-cream-dark px-3 py-2 text-xs font-mono leading-relaxed" value={note} />
            <div className="flex gap-2">
              <Button variant="primary" onClick={copy} className="flex-1">{copied ? '✓ Copied!' : '📋 Copy Note'}</Button>
              <Button variant="secondary" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
