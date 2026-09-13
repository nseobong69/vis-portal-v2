import { useState } from 'react';

// Ported from renderCalendar() / calEventRow() / addCalEvent() /
// deleteCalEvent() (index.html ~L21339-21388). Table: school_calendar,
// columns: title, event_date, event_type. Upcoming/Past split and type
// colors match the old app exactly.

interface CalEvent {
  id: string;
  title: string;
  event_date: string;
  event_type: string;
}

interface Props {
  initialEvents: CalEvent[];
  canManage: boolean;
}

const TYPE_COLORS: Record<string, { color: string; bg: string; icon: string }> = {
  event:      { color: '#2563EB', bg: '#DBEAFE', icon: '📅' },
  exam:       { color: '#D97706', bg: '#FEF3C7', icon: '✏️' },
  holiday:    { color: '#16A34A', bg: '#DCFCE7', icon: '🏖️' },
  resumption: { color: '#5D4037', bg: '#F5EDE3', icon: '🏫' },
};

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function SchoolCalendar({ initialEvents, canManage }: Props) {
  const [events, setEvents] = useState<CalEvent[]>(initialEvents);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState('event');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const now = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.event_date >= now);
  const past = events.filter((e) => e.event_date < now).slice(0, 10);

  async function handleAdd() {
    if (!title.trim() || !date) { setError('Fill in title and date.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/admin/calendar/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', title: title.trim(), event_date: date, event_type: type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add event.');
      setEvents((prev) => [...prev, data.event].sort((a, b) => a.event_date.localeCompare(b.event_date)));
      setTitle('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add event.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this event?')) return;
    setBusyId(id);
    try {
      const res = await fetch('/api/admin/calendar/action', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.');
    } finally {
      setBusyId(null);
    }
  }

  function EventRow({ e }: { e: CalEvent }) {
    const style = TYPE_COLORS[e.event_type] ?? TYPE_COLORS.event;
    return (
      <div className="flex items-center gap-3 px-4 py-3 border-b border-brand-cream-dark last:border-0">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-base shrink-0"
          style={{ background: style.bg, color: style.color }}>
          {style.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-brand-brown-dark truncate">{e.title}</div>
          <div className="text-xs text-brand-brown-light">{fmtDate(e.event_date)}</div>
        </div>
        <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold capitalize shrink-0"
          style={{ background: style.bg, color: style.color }}>
          {e.event_type}
        </span>
        {canManage && (
          <button
            onClick={() => handleDelete(e.id)}
            disabled={busyId === e.id}
            className="w-7 h-7 rounded-md flex items-center justify-center bg-danger-700/10 text-danger-700 hover:bg-danger-700/20 disabled:opacity-40 shrink-0"
          >
            🗑
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Add form */}
      {canManage && (
        <div className="rounded-md border border-brand-cream-dark bg-white p-5">
          <div className="mb-4 font-heading font-semibold text-sm text-brand-brown-dark">+ Add Event</div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-[2] min-w-[160px]">
              <label className="text-xs font-medium text-brand-brown-dark block mb-1">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event title"
                className="w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2 bg-white"
              />
            </div>
            <div className="flex-1 min-w-[130px]">
              <label className="text-xs font-medium text-brand-brown-dark block mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2 bg-white"
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="text-xs font-medium text-brand-brown-dark block mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2 bg-white"
              >
                <option value="event">Event</option>
                <option value="exam">Exam</option>
                <option value="holiday">Holiday</option>
                <option value="resumption">Resumption</option>
              </select>
            </div>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 rounded-md bg-brand-brown-dark text-white text-sm font-semibold hover:brightness-110 disabled:opacity-60"
            >
              {saving ? '…' : '+ Add'}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-danger-700">{error}</p>}
        </div>
      )}

      {/* Upcoming */}
      <div className="rounded-md border border-brand-cream-dark bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-cream-dark font-heading font-semibold text-sm text-brand-brown-dark">
          Upcoming Events
        </div>
        {upcoming.length ? (
          upcoming.map((e) => <EventRow key={e.id} e={e} />)
        ) : (
          <div className="px-4 py-8 text-center text-brand-brown-light text-sm">No upcoming events.</div>
        )}
      </div>

      {/* Past */}
      {past.length > 0 && (
        <div className="rounded-md border border-brand-cream-dark bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-brand-cream-dark font-heading font-semibold text-sm text-brand-brown-light">
            Past Events
          </div>
          {past.map((e) => <EventRow key={e.id} e={e} />)}
        </div>
      )}
    </div>
  );
}
