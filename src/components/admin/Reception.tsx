import { useState } from 'react';

// Ported from renderReception() / _showCheckInModal() / _checkInVisitor() /
// _checkOutVisitor() / downloadGatePass() (index.html ~L20811-20952).
// Table: visitors. Gate pass PDF uses jsPDF, same library as the old app —
// requires `jspdf` as a dependency (`npm install jspdf`).

interface Visitor {
  id: string;
  full_name: string;
  phone: string | null;
  id_type: string | null;
  id_number: string | null;
  purpose: string | null;
  host_name: string | null;
  visiting_student: string | null;
  badge_number: string | null;
  status: 'checked_in' | 'checked_out';
  check_in_time: string;
  check_out_time: string | null;
  logged_by: string | null;
}

interface Props {
  initialVisitors: Visitor[];
  schoolName: string;
  logoUrl: string | null;
}

const PURPOSES = [
  'Meeting with Staff', "Meeting with Student's Parent/Guardian",
  'Delivery', 'Inspection', 'Interview', 'Vendor/Contractor', 'Event', 'Other',
];

async function api(body: object) {
  const res = await fetch('/api/admin/reception/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

// Loads an image URL into a data URL so jsPDF can embed it. Ported from
// _loadLogoDataUrl() — best-effort, returns null on any failure so the
// pass still renders (just without the logo).
async function loadLogoDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function downloadGatePass(v: Visitor, schoolName: string, logoUrl: string | null) {
  const { jsPDF } = await import('jspdf');
  const W = 95;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [W, 140] });

  pdf.setFillColor(93, 64, 55);
  pdf.rect(0, 0, W, 22, 'F');
  pdf.setFillColor(201, 162, 75);
  pdf.rect(0, 22, W, 1, 'F');

  const logoData = await loadLogoDataUrl(logoUrl);
  if (logoData) {
    try { pdf.addImage(logoData, 'JPEG', 6, 4, 14, 14); } catch { /* ignore bad image */ }
  }

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(8.5);
  pdf.setFont('helvetica', 'bold');
  pdf.text(schoolName || 'SCHOOL', logoData ? 23 : W / 2, 10, {
    align: logoData ? 'left' : 'center',
    maxWidth: logoData ? 66 : W - 10,
  });
  pdf.setFontSize(6.5);
  pdf.setFont('helvetica', 'normal');
  pdf.text('VISITOR GATE PASS', logoData ? 23 : W / 2, 16, { align: logoData ? 'left' : 'center' });

  let y = 30;
  pdf.setTextColor(30, 30, 30);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('BADGE NO.', 8, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(v.badge_number || '—', 8, y + 5);
  y += 13;

  const field = (label: string, val: string | null | undefined) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(120, 120, 120);
    pdf.text(label, 8, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(30, 30, 30);
    pdf.text(String(val || '—'), 8, y + 4.5, { maxWidth: W - 16 });
    y += 11;
  };

  field('VISITOR NAME', v.full_name);
  field('PHONE', v.phone);
  field('PURPOSE', v.purpose);
  field('HOST / OFFICE', v.host_name);
  if (v.visiting_student) field('VISITING STUDENT', v.visiting_student);
  field('CHECK-IN TIME', new Date(v.check_in_time).toLocaleString());

  pdf.setDrawColor(200, 200, 200);
  pdf.line(8, y, W - 8, y);
  y += 6;
  pdf.setFontSize(6);
  pdf.setTextColor(150, 150, 150);
  pdf.text('Please wear this pass visibly at all times and return it at exit.', W / 2, y, {
    align: 'center', maxWidth: W - 12,
  });

  pdf.save(`GatePass_${(v.full_name || 'visitor').replace(/\s+/g, '_')}.pdf`);
}

export default function Reception({ initialVisitors, schoolName, logoUrl }: Props) {
  const [visitors, setVisitors] = useState<Visitor[]>(initialVisitors);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [idType, setIdType] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [purpose, setPurpose] = useState(PURPOSES[0]);
  const [host, setHost] = useState('');
  const [student, setStudent] = useState('');

  const checkedIn = visitors.filter((v) => v.status === 'checked_in');
  const today = new Date().toDateString();
  const todayCount = visitors.filter((v) => new Date(v.check_in_time).toDateString() === today).length;

  const filteredLog = search.trim()
    ? visitors.filter((v) => {
        const q = search.toLowerCase();
        return (
          v.full_name.toLowerCase().includes(q) ||
          (v.purpose || '').toLowerCase().includes(q) ||
          (v.host_name || '').toLowerCase().includes(q) ||
          (v.badge_number || '').toLowerCase().includes(q)
        );
      })
    : visitors;

  function resetForm() {
    setName(''); setPhone(''); setIdType(''); setIdNumber('');
    setPurpose(PURPOSES[0]); setHost(''); setStudent('');
  }

  async function handleCheckIn() {
    if (!name.trim()) { setError('Visitor name is required.'); return; }
    setSaving(true); setError('');
    try {
      const data = await api({
        action: 'checkIn',
        full_name: name.trim(), phone, id_type: idType, id_number: idNumber,
        purpose, host_name: host, visiting_student: student,
      });
      setVisitors((prev) => [data.visitor, ...prev]);
      setShowCheckIn(false);
      resetForm();
      // Mirrors the old flow: auto-download the gate pass right after check-in.
      setTimeout(() => downloadGatePass(data.visitor, schoolName, logoUrl), 400);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check in visitor.');
    } finally { setSaving(false); }
  }

  async function handleCheckOut(id: string) {
    setBusyId(id);
    try {
      await api({ action: 'checkOut', id });
      setVisitors((prev) => prev.map((v) => v.id === id
        ? { ...v, status: 'checked_out' as const, check_out_time: new Date().toISOString() } : v));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check out visitor.');
    } finally { setBusyId(null); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-heading font-bold text-2xl text-brand-brown-dark">Reception</h1>
          <p className="text-sm text-brand-brown-light">Visitor log &amp; gate pass</p>
        </div>
        <button onClick={() => { setShowCheckIn(true); setError(''); }} className="px-4 py-2 rounded-md bg-brand-brown-dark text-white text-sm font-semibold hover:brightness-110">
          + Check In Visitor
        </button>
      </div>

      {error && <p className="text-sm text-danger-700">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-brand-cream-dark bg-white p-4">
          <div className="text-[11px] uppercase font-bold text-brand-brown-light">Currently On-Site</div>
          <div className="text-xl font-extrabold" style={{ color: '#D97706' }}>{checkedIn.length}</div>
        </div>
        <div className="rounded-md border border-brand-cream-dark bg-white p-4">
          <div className="text-[11px] uppercase font-bold text-brand-brown-light">Visitors Today</div>
          <div className="text-xl font-extrabold text-brand-brown-dark">{todayCount}</div>
        </div>
        <div className="rounded-md border border-brand-cream-dark bg-white p-4">
          <div className="text-[11px] uppercase font-bold text-brand-brown-light">Total Logged</div>
          <div className="text-xl font-extrabold text-brand-brown-dark">{visitors.length}</div>
        </div>
      </div>

      {/* Check-in modal */}
      {showCheckIn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-bold text-lg text-brand-brown-dark">Check In Visitor</h2>
              <button onClick={() => setShowCheckIn(false)} className="text-2xl text-brand-brown-light">×</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-brand-brown-dark block mb-1">Full Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Visitor's full name" className="w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2" />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-brown-dark block mb-1">Phone Number</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="080xxxxxxxx" className="w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-brand-brown-dark block mb-1">ID Type</label>
                  <select value={idType} onChange={(e) => setIdType(e.target.value)} className="w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2">
                    <option value="">— None —</option>
                    <option>National ID</option><option>Driver&apos;s License</option>
                    <option>Voter&apos;s Card</option><option>Staff ID</option><option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-brand-brown-dark block mb-1">ID Number</label>
                  <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="Optional" className="w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-brand-brown-dark block mb-1">Purpose of Visit *</label>
                <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className="w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2">
                  {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-brand-brown-dark block mb-1">Person/Office to See (Host)</label>
                <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="e.g. Mrs. Johnson, Principal's Office" className="w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2" />
              </div>
              <div>
                <label className="text-xs font-medium text-brand-brown-dark block mb-1">Visiting Student (if applicable)</label>
                <input value={student} onChange={(e) => setStudent(e.target.value)} placeholder="Student name/class" className="w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2" />
              </div>
            </div>
            {error && <p className="text-sm text-danger-700">{error}</p>}
            <div className="flex gap-2">
              <button onClick={handleCheckIn} disabled={saving} className="flex-1 py-3 rounded-md bg-brand-brown-dark text-white font-semibold disabled:opacity-60">
                {saving ? 'Checking in…' : '✓ Check In & Generate Gate Pass'}
              </button>
              <button onClick={() => setShowCheckIn(false)} className="px-4 py-3 rounded-md border border-brand-cream-dark text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* On-site now */}
      <div className="rounded-md border border-brand-cream-dark bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-cream-dark font-semibold text-sm text-brand-brown-dark">
          On-Site Now ({checkedIn.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-brand-brown-light border-b border-brand-cream-dark">
                <th className="px-4 py-2">Badge</th>
                <th className="px-4 py-2">Visitor</th>
                <th className="px-4 py-2">Purpose</th>
                <th className="px-4 py-2">Host</th>
                <th className="px-4 py-2">Check-In</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {checkedIn.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-6 text-brand-brown-light">No visitors on-site.</td></tr>
              ) : checkedIn.map((v) => (
                <tr key={v.id} className="border-b border-brand-cream-dark last:border-0">
                  <td className="px-4 py-2 font-bold">{v.badge_number || '—'}</td>
                  <td className="px-4 py-2">
                    {v.full_name}
                    {v.phone && <div className="text-xs text-brand-brown-light">{v.phone}</div>}
                  </td>
                  <td className="px-4 py-2">{v.purpose || '—'}</td>
                  <td className="px-4 py-2">{v.host_name || '—'}</td>
                  <td className="px-4 py-2 text-xs">{new Date(v.check_in_time).toLocaleTimeString()}</td>
                  <td className="px-4 py-2 flex gap-1.5 flex-wrap">
                    <button onClick={() => downloadGatePass(v, schoolName, logoUrl)} title="Gate Pass" className="text-xs font-semibold px-3 py-1.5 rounded-md border border-brand-cream-dark hover:bg-brand-cream">
                      🪪
                    </button>
                    <button onClick={() => handleCheckOut(v.id)} disabled={busyId === v.id} className="text-xs font-semibold px-3 py-1.5 rounded-md bg-danger-700/10 text-danger-700 disabled:opacity-50">
                      {busyId === v.id ? 'Checking out…' : 'Check Out'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full log */}
      <div className="rounded-md border border-brand-cream-dark bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-cream-dark">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search visitor log…" className="max-w-[230px] w-full text-sm rounded-sm border border-brand-cream-dark px-3 py-2" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-brand-brown-light border-b border-brand-cream-dark">
                <th className="px-4 py-2">Badge</th>
                <th className="px-4 py-2">Visitor</th>
                <th className="px-4 py-2">Purpose</th>
                <th className="px-4 py-2">Host</th>
                <th className="px-4 py-2">Check-In</th>
                <th className="px-4 py-2">Check-Out</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLog.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-6 text-brand-brown-light">No visitor records yet.</td></tr>
              ) : filteredLog.map((v) => (
                <tr key={v.id} className="border-b border-brand-cream-dark last:border-0">
                  <td className="px-4 py-2">{v.badge_number || '—'}</td>
                  <td className="px-4 py-2">{v.full_name}</td>
                  <td className="px-4 py-2">{v.purpose || '—'}</td>
                  <td className="px-4 py-2">{v.host_name || '—'}</td>
                  <td className="px-4 py-2 text-xs">{new Date(v.check_in_time).toLocaleString()}</td>
                  <td className="px-4 py-2 text-xs">{v.check_out_time ? new Date(v.check_out_time).toLocaleString() : '—'}</td>
                  <td className="px-4 py-2">
                    {v.status === 'checked_in'
                      ? <span className="font-bold" style={{ color: '#D97706' }}>On-site</span>
                      : <span style={{ color: '#16A34A' }}>Checked out</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
