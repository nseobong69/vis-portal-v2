import { useEffect, useMemo, useState } from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import AptitudeTest from './AptitudeTest';
import {
  fetchCountries,
  fetchStates,
  fetchCities,
} from '../../lib/admissions-locations';

interface ClassOption {
  id: string;
  name: string;
}

interface SchoolSettings {
  school_name?: string;
  motto?: string;
  admission_fee_default?: number | string;
  admission_fee_sections?: Record<string, number>;
  admission_fee_configs?: Record<string, number>;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  payment_phone?: string;
  phone1?: string;
}

interface Props {
  classes: ClassOption[];
  settings: SchoolSettings;
}

const BASE_STEP_LABELS = [
  'Basic', 'Biodata', 'Religion', 'Previous School', 'Parents', 'Health & Consent', 'Academic', 'Test', 'Payment',
];

type PayMethod = 'transfer' | 'cash' | 'paystack' | '';

interface FormState {
  full_name: string;
  class_applied: string;
  gender: string;
  date_of_birth: string;
  permanent_address: string;
  nationality: string;
  state_of_origin: string;
  lga: string;
  lga_text: string;
  religion: string;
  denomination: string;
  same_addr: boolean;
  residential_address: string;
  previous_school_choice: string; // '', 'nil', 'other'
  previous_class: string;
  last_promoted_class: string;
  previous_school_name: string;
  parent_name: string;
  parent_relationship: string;
  parent_address: string;
  phone: string;
  email: string;
  parents_married: string;
  parents_together: string;
  responsibility: string;
  lives_with: string;
  emergency_name: string;
  emergency_relationship: string;
  emergency_phone: string;
  emergency_address: string;
  health_issue: string; // 'no'|'yes'
  health_desc: string;
  disability: string; // 'no'|'yes'
  disability_desc: string;
  consent_discipline: boolean;
  consent_medical: boolean;
  payment_method: PayMethod;
}

const initialState: FormState = {
  full_name: '', class_applied: '', gender: 'Male', date_of_birth: '',
  permanent_address: '', nationality: '', state_of_origin: '', lga: '', lga_text: '',
  religion: '', denomination: '', same_addr: false, residential_address: '',
  previous_school_choice: '', previous_class: '', last_promoted_class: '', previous_school_name: '',
  parent_name: '', parent_relationship: 'Father', parent_address: '', phone: '', email: '',
  parents_married: 'yes', parents_together: 'yes', responsibility: 'Parent', lives_with: 'Family',
  emergency_name: '', emergency_relationship: '', emergency_phone: '', emergency_address: '',
  health_issue: 'no', health_desc: '', disability: 'no', disability_desc: '',
  consent_discipline: false, consent_medical: false, payment_method: '',
};

function computeFee(cls: string, settings: SchoolSettings, classes: ClassOption[]): number {
  const match = classes.find((c) => c.name === cls);
  const cfgs = settings.admission_fee_configs || {};
  const secFees = settings.admission_fee_sections || {};
  const defFee = parseFloat(String(settings.admission_fee_default || 0)) || 0;
  if (match && cfgs[match.id] && parseFloat(String(cfgs[match.id])) > 0) {
    return parseFloat(String(cfgs[match.id]));
  }
  const low = cls.toLowerCase();
  let secKey = 'secondary';
  if (/kindergarten|kg\b/.test(low)) secKey = 'kindergarten';
  else if (/nursery|nur/.test(low)) secKey = 'nursery';
  else if (/primary|pri|pry/.test(low)) secKey = 'primary';
  const secFee = secFees[secKey] ? parseFloat(String(secFees[secKey])) : 0;
  return secFee > 0 ? secFee : defFee;
}

export default function AdmissionWizard({ classes, settings }: Props) {
  const [step, setStep] = useState(0); // index into BASE_STEP_LABELS
  const [form, setForm] = useState<FormState>(initialState);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ admission_number?: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Aptitude test (CBT) gating — mirrors old app's onAdmClassChange() check
  // against cbt_exams for the selected class.
  const [cbtRequired, setCbtRequired] = useState(false);
  const [cbtExam, setCbtExam] = useState<{ id: string; title: string; duration_minutes?: number } | null>(null);
  const [cbtResult, setCbtResult] = useState<{ score: number; total_marks: number; percentage: number } | null>(null);
  const activeSteps = useMemo(
    () => BASE_STEP_LABELS.map((_, i) => i).filter((i) => i !== 7 || cbtRequired),
    [cbtRequired],
  );
  const stepPos = activeSteps.indexOf(step);

  // Paystack payment state
  const [payConfirmed, setPayConfirmed] = useState(false);
  const [paystackRef, setPaystackRef] = useState<string | null>(null);
  const [paystackAmountPaid, setPaystackAmountPaid] = useState(0);
  const [paystackBusy, setPaystackBusy] = useState(false);

  const [countries, setCountries] = useState<string[]>([]);
  const [countrySource, setCountrySource] = useState<'live' | 'fallback' | null>(null);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [locLoading, setLocLoading] = useState(false);

  const fee = useMemo(() => computeFee(form.class_applied, settings, classes), [form.class_applied, settings, classes]);
  const [payAmount, setPayAmount] = useState<number>(0);

  useEffect(() => {
    setPayAmount(fee);
  }, [fee]);

  useEffect(() => {
    let alive = true;
    fetchCountries().then(({ countries, source }) => {
      if (!alive) return;
      setCountries(countries);
      setCountrySource(source);
    });
    return () => {
      alive = false;
    };
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onClassChange(value: string) {
    set('class_applied', value);
    setCbtRequired(false);
    setCbtExam(null);
    setCbtResult(null);
    if (!value) return;
    try {
      const res = await fetch('/api/admissions/cbt-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_name: value }),
      });
      const json = await res.json();
      if (json.required && json.exam) {
        setCbtRequired(true);
        setCbtExam(json.exam);
      }
    } catch {
      // no test gate if the check fails — don't block applicants over it
    }
  }

  async function payWithPaystack() {
    const rawEmail = form.email.trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail);
    const email = emailOk ? rawEmail : 'admission@vis.edu';
    const amount = payAmount > 0 ? Math.min(payAmount, fee) : fee;
    if (!amount) {
      setErrors(['No admission fee is set for this class.']);
      return;
    }
    setPaystackBusy(true);
    setErrors([]);
    // Open the tab synchronously inside the click handler so popup blockers
    // allow it (same pattern as the old app's initiatePaystackAdmission).
    const payWindow = window.open('', '_blank');
    if (!payWindow) {
      setErrors(['Popup blocked. Please allow popups for this site and try again.']);
      setPaystackBusy(false);
      return;
    }
    try {
      const reference = `ADM-${Date.now()}`;
      const res = await fetch('/api/admissions/paystack-initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, amount, reference, name: form.full_name,
          callback_url: `${window.location.origin}/admissions/paystack-callback`,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not start Paystack payment.');
      payWindow.location.href = json.authorization_url;
    } catch (e: any) {
      try { payWindow.close(); } catch {}
      setErrors([e?.message || 'Could not start Paystack payment.']);
    } finally {
      setPaystackBusy(false);
    }
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== 'admission-paystack-verified') return;
      if (e.data.success) {
        setPayConfirmed(true);
        setPaystackRef(e.data.reference || null);
        setPaystackAmountPaid(e.data.amount || 0);
      } else {
        setErrors(['Payment could not be confirmed. Please try again, or choose bank transfer / cash.']);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  async function onNationalityChange(value: string) {
    set('nationality', value);
    set('state_of_origin', '');
    set('lga', '');
    set('lga_text', '');
    setStates([]);
    setCities([]);
    if (!value) return;
    setLocLoading(true);
    const { states } = await fetchStates(value);
    setStates(states);
    setLocLoading(false);
  }

  async function onStateChange(value: string) {
    set('state_of_origin', value);
    set('lga', '');
    setCities([]);
    if (!value || form.nationality === 'Nigeria') return;
    setLocLoading(true);
    const { cities } = await fetchCities(form.nationality, value);
    setCities(cities);
    setLocLoading(false);
  }

  function validateStep(n: number): string[] {
    const errs: string[] = [];
    if (n === 0) {
      if (!form.full_name.trim()) errs.push('Full name is required.');
      if (!form.class_applied) errs.push('Please select a class.');
    }
    if (n === 1) {
      if (!form.date_of_birth) errs.push('Date of birth is required.');
      if (!form.nationality) errs.push('Nationality is required.');
    }
    if (n === 4) {
      if (!form.parent_name.trim()) errs.push('Parent/guardian name is required.');
      if (!form.phone.trim()) errs.push('Phone number is required.');
      if (!form.email.trim()) errs.push('Email is required.');
    }
    if (n === 5) {
      if (!form.consent_discipline) errs.push('You must accept the discipline & conduct policy.');
      if (!form.consent_medical) errs.push('You must approve emergency medical consent.');
    }
    if (n === 7 && cbtRequired) {
      if (!cbtResult) errs.push('You must complete the aptitude test before continuing.');
    }
    if (n === 8) {
      if (!form.payment_method) errs.push('Please select a payment method.');
    }
    return errs;
  }

  function next() {
    const errs = validateStep(step);
    setErrors(errs);
    if (errs.length) return;
    const pos = activeSteps.indexOf(step);
    setStep(activeSteps[Math.min(pos + 1, activeSteps.length - 1)]);
  }
  function back() {
    setErrors([]);
    const pos = activeSteps.indexOf(step);
    setStep(activeSteps[Math.max(pos - 1, 0)]);
  }

  async function submit() {
    const errs = validateStep(8);
    setErrors(errs);
    if (errs.length) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const isOnlinePay = form.payment_method === 'paystack';
      const paidNow = isOnlinePay && payConfirmed ? paystackAmountPaid : 0;
      const payload = {
        full_name: form.full_name.trim(),
        class_applied: form.class_applied,
        class_admitted: form.class_applied,
        gender: form.gender,
        date_of_birth: form.date_of_birth,
        nationality: form.nationality,
        state_of_origin: form.state_of_origin || null,
        lga: form.lga || form.lga_text.trim() || null,
        permanent_address: form.permanent_address.trim() || null,
        residential_address: form.same_addr ? form.permanent_address.trim() || null : form.residential_address.trim() || null,
        religion: form.religion || null,
        denomination: form.denomination.trim() || null,
        previous_school: form.previous_school_choice === 'other' ? form.previous_school_name.trim() || null : null,
        previous_class: form.previous_school_choice === 'other' ? form.previous_class.trim() || null : null,
        last_promoted_class: form.previous_school_choice === 'other' ? form.last_promoted_class.trim() || null : null,
        parent_name: form.parent_name.trim(),
        parent_relationship: form.parent_relationship,
        parent_address: form.parent_address.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim(),
        parents_married: form.parents_married === 'yes',
        parents_together: form.parents_together === 'yes',
        responsibility: form.responsibility,
        lives_with: form.lives_with,
        emergency_name: form.emergency_name.trim() || null,
        emergency_relationship: form.emergency_relationship.trim() || null,
        emergency_phone: form.emergency_phone.trim() || null,
        emergency_address: form.emergency_address.trim() || null,
        health_issues: form.health_issue === 'yes' ? (form.health_desc.trim() || 'Yes') : null,
        disability: form.disability === 'yes' ? (form.disability_desc.trim() || 'Yes') : null,
        consent_discipline: form.consent_discipline,
        consent_medical: form.consent_medical,
        admission_fee: fee,
        payment_method: form.payment_method,
        payment_status: isOnlinePay ? (payConfirmed ? (paidNow >= fee ? 'paid' : 'partial') : 'pending_confirmation') : 'pending_confirmation',
        amount_paid: paidNow,
        paystack_ref: paystackRef,
        pub_payment_confirmed: isOnlinePay && payConfirmed,
        aptitude_score: cbtResult?.percentage ?? null,
        status: 'pending',
      };
      const res = await fetch('/api/admissions/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Submission failed.');
      setSubmitted({ admission_number: json?.admission_number });
    } catch (e: any) {
      setSubmitError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="max-w-[560px] mx-auto px-5 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-success-soft text-success-700 flex items-center justify-center mx-auto mb-4 text-2xl">✓</div>
        <h2 className="font-heading font-extrabold text-2xl text-brand-brown-dark mb-2">Application submitted</h2>
        <p className="text-brand-brown-light mb-1">
          Thank you — your application for <strong>{form.full_name}</strong> has been received.
        </p>
        {submitted.admission_number && (
          <p className="text-brand-brown-light mb-4">Reference: <strong>{submitted.admission_number}</strong></p>
        )}
        {form.payment_method === 'transfer' && (
          <p className="text-sm text-brand-brown-light mb-4">Please complete your bank transfer using the details shown and our team will confirm it.</p>
        )}
        {form.payment_method === 'cash' && (
          <p className="text-sm text-brand-brown-light mb-4">Please visit the school office to complete your cash payment.</p>
        )}
        <a href="/" className="inline-block text-brand-gold-dark font-semibold underline">Back home</a>
      </div>
    );
  }

  return (
    <div className="max-w-[720px] mx-auto px-5 py-10">
      <div className="text-center mb-6 pb-4 border-b border-brand-cream-dark">
        <h1 className="font-heading font-extrabold text-2xl text-brand-brown-dark">{settings.school_name || 'Admissions'}</h1>
        <p className="text-sm text-brand-brown-light">{settings.motto || 'Wisdom, Knowledge and Success'}</p>
        <div className="text-sm font-bold text-brand-brown mt-2">PUBLIC ADMISSION FORM</div>
      </div>

      <div className="flex gap-1 mb-8" aria-label="Progress">
        {activeSteps.map((i) => (
          <div
            key={i}
            title={BASE_STEP_LABELS[i]}
            className={`flex-1 h-1.5 rounded-full ${i <= step ? 'bg-brand-brown' : 'bg-brand-cream-dark'}`}
          />
        ))}
      </div>

      {errors.length > 0 && (
        <div className="bg-danger-soft text-danger-700 rounded-md px-4 py-3 mb-5 text-sm">
          <ul className="list-disc pl-4">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <h3 className="font-heading font-bold text-brand-brown-dark">Basic Details</h3>
          <Input id="full_name" label="Full Name *" placeholder="Surname Firstname Othername"
            value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
          <Select id="class_applied" label="Class Applying For *" placeholder="Select class"
            options={classes.map((c) => ({ value: c.name, label: c.name }))}
            value={form.class_applied} onChange={(e) => onClassChange(e.target.value)} />
          {cbtRequired && cbtExam && (
            <div className="bg-gradient-to-br from-[#6D28D9] to-[#7C3AED] text-white rounded-lg px-5 py-4 flex items-center gap-3">
              <span className="text-2xl">🧠</span>
              <div>
                <div className="text-xs uppercase tracking-wide opacity-80 font-bold">Aptitude Test Required</div>
                <div className="font-extrabold">{cbtExam.title}</div>
                <div className="text-xs opacity-80 mt-1">You'll take this before completing payment.</div>
              </div>
            </div>
          )}
          {fee > 0 && form.class_applied && (
            <div className="bg-gradient-to-br from-brand-brown to-[#8D6E63] text-white rounded-lg px-5 py-4">
              <div className="text-xs uppercase tracking-wide opacity-80 font-semibold">Admission Fee</div>
              <div className="text-2xl font-extrabold">₦{fee.toLocaleString()}</div>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <h3 className="font-heading font-bold text-brand-brown-dark">Biodata</h3>
          <div className="grid grid-cols-2 gap-3">
            <Select id="gender" label="Gender *" options={[{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }]}
              value={form.gender} onChange={(e) => set('gender', e.target.value)} />
            <Input id="dob" label="Date of Birth *" type="date" value={form.date_of_birth}
              onChange={(e) => set('date_of_birth', e.target.value)} />
          </div>
          <label className="text-sm font-medium text-brand-brown-dark" htmlFor="perm_addr">Permanent Address</label>
          <textarea id="perm_addr" rows={2} className="rounded-sm border border-brand-cream-dark px-3 py-2 text-sm"
            value={form.permanent_address} onChange={(e) => set('permanent_address', e.target.value)} />
          <Select id="nationality" label="Nationality *" placeholder={countries.length ? 'Select country' : 'Loading countries…'}
            options={countries.map((c) => ({ value: c, label: c }))}
            value={form.nationality} onChange={(e) => onNationalityChange(e.target.value)} />
          {countrySource === 'fallback' && (
            <p className="text-xs text-brand-brown-light -mt-2">Showing a short country list — the live lookup is temporarily unavailable.</p>
          )}
          {form.nationality && (
            states.length > 0 ? (
              <Select id="state" label="State of Origin" placeholder="Select state"
                options={states.map((s) => ({ value: s, label: s }))}
                value={form.state_of_origin} onChange={(e) => onStateChange(e.target.value)} />
            ) : (
              <Input id="state_txt" label="State / Province" placeholder={locLoading ? 'Loading…' : 'Enter state or province'}
                value={form.state_of_origin} onChange={(e) => set('state_of_origin', e.target.value)} />
            )
          )}
          {form.nationality && form.state_of_origin && (
            cities.length > 0 ? (
              <Select id="lga" label="LGA / City" placeholder="Select"
                options={cities.map((c) => ({ value: c, label: c }))}
                value={form.lga} onChange={(e) => set('lga', e.target.value)} />
            ) : (
              <Input id="lga_txt" label="LGA / District" placeholder="Enter LGA / district name"
                value={form.lga_text} onChange={(e) => set('lga_text', e.target.value)} />
            )
          )}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <h3 className="font-heading font-bold text-brand-brown-dark">Religion</h3>
          <div className="grid grid-cols-2 gap-3">
            <Select id="religion" label="Religion" placeholder="Select"
              options={['Christianity', 'Islam', 'Traditional', 'Other'].map((v) => ({ value: v, label: v }))}
              value={form.religion} onChange={(e) => set('religion', e.target.value)} />
            <Input id="denom" label="Denomination / Sect" placeholder="e.g. Catholic, Baptist, Sunni"
              value={form.denomination} onChange={(e) => set('denomination', e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.same_addr} onChange={(e) => set('same_addr', e.target.checked)} />
            Residential address is same as permanent address
          </label>
          {!form.same_addr && (
            <>
              <label className="text-sm font-medium text-brand-brown-dark" htmlFor="res_addr">Residential Address</label>
              <textarea id="res_addr" rows={2} className="rounded-sm border border-brand-cream-dark px-3 py-2 text-sm"
                value={form.residential_address} onChange={(e) => set('residential_address', e.target.value)} />
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <h3 className="font-heading font-bold text-brand-brown-dark">Previous School</h3>
          <Select id="prev_choice" label="Previous School" placeholder="Select"
            options={[{ value: 'nil', label: 'Nil (No previous school)' }, { value: 'other', label: 'Other School' }]}
            value={form.previous_school_choice} onChange={(e) => set('previous_school_choice', e.target.value)} />
          {form.previous_school_choice === 'other' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Input id="prev_cls" label="Previous Class" placeholder="e.g. Primary 5"
                  value={form.previous_class} onChange={(e) => set('previous_class', e.target.value)} />
                <Input id="last_promo" label="Last Promoted Class" placeholder="e.g. Primary 6"
                  value={form.last_promoted_class} onChange={(e) => set('last_promoted_class', e.target.value)} />
              </div>
              <Input id="prev_school_name" label="Previous School Name" placeholder="School name"
                value={form.previous_school_name} onChange={(e) => set('previous_school_name', e.target.value)} />
            </>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-4">
          <h3 className="font-heading font-bold text-brand-brown-dark">Parent / Guardian</h3>
          <div className="grid grid-cols-2 gap-3">
            <Input id="par_name" label="Full Name *" placeholder="Parent/Guardian name"
              value={form.parent_name} onChange={(e) => set('parent_name', e.target.value)} />
            <Select id="par_rel" label="Relationship"
              options={['Father', 'Mother', 'Guardian', 'Relative'].map((v) => ({ value: v, label: v }))}
              value={form.parent_relationship} onChange={(e) => set('parent_relationship', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input id="phone" label="Phone Number *" type="tel" placeholder="08xxxxxxxxxx"
              value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            <Input id="email" label="Email *" type="email" placeholder="parent@email.com"
              value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <label className="text-sm font-medium text-brand-brown-dark" htmlFor="par_addr">Parent Address</label>
          <textarea id="par_addr" rows={2} className="rounded-sm border border-brand-cream-dark px-3 py-2 text-sm"
            value={form.parent_address} onChange={(e) => set('parent_address', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Select id="married" label="Parents Married?" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
              value={form.parents_married} onChange={(e) => set('parents_married', e.target.value)} />
            <Select id="together" label="Parents Living Together?" options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
              value={form.parents_together} onChange={(e) => set('parents_together', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select id="resp" label="Who Takes Responsibility?"
              options={['Parent', 'Guardian', 'Relative'].map((v) => ({ value: v, label: v }))}
              value={form.responsibility} onChange={(e) => set('responsibility', e.target.value)} />
            <Select id="lives" label="Child Lives With?"
              options={['Family', 'Mother', 'Father', 'Relative', 'Guardian'].map((v) => ({ value: v, label: v }))}
              value={form.lives_with} onChange={(e) => set('lives_with', e.target.value)} />
          </div>
          <h4 className="font-bold text-sm text-brand-brown-dark mt-2">Emergency Contact</h4>
          <div className="grid grid-cols-2 gap-3">
            <Input id="emer_name" label="Emergency Contact Name" value={form.emergency_name}
              onChange={(e) => set('emergency_name', e.target.value)} />
            <Input id="emer_rel" label="Relationship" placeholder="e.g. Uncle" value={form.emergency_relationship}
              onChange={(e) => set('emergency_relationship', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input id="emer_phone" label="Emergency Phone" type="tel" value={form.emergency_phone}
              onChange={(e) => set('emergency_phone', e.target.value)} />
            <Input id="emer_addr" label="Emergency Address" value={form.emergency_address}
              onChange={(e) => set('emergency_address', e.target.value)} />
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="flex flex-col gap-4">
          <h3 className="font-heading font-bold text-brand-brown-dark">Health & Consent</h3>
          <Select id="health" label="Any health issues?" options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]}
            value={form.health_issue} onChange={(e) => set('health_issue', e.target.value)} />
          {form.health_issue === 'yes' && (
            <Input id="health_desc" label="Describe health issue" value={form.health_desc}
              onChange={(e) => set('health_desc', e.target.value)} />
          )}
          <Select id="disability" label="Any disability?" options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]}
            value={form.disability} onChange={(e) => set('disability', e.target.value)} />
          {form.disability === 'yes' && (
            <Input id="disability_desc" label="Specify disability" value={form.disability_desc}
              onChange={(e) => set('disability_desc', e.target.value)} />
          )}
          {fee > 0 && (
            <div className="bg-brand-cream rounded-md px-4 py-3 border-l-4 border-brand-brown">
              <div className="text-sm font-bold text-brand-brown">Admission Fee Summary</div>
              <div className="text-sm">Total Admission Fee: <strong>₦{fee.toLocaleString()}</strong></div>
            </div>
          )}
          <div className="bg-brand-cream rounded-md p-4 flex flex-col gap-3">
            <div className="font-bold text-brand-brown-dark">Consent</div>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={form.consent_discipline}
                onChange={(e) => set('consent_discipline', e.target.checked)} />
              I accept the school's discipline rules and code of conduct and understand that disciplinary measures may be applied as per school policy.
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={form.consent_medical}
                onChange={(e) => set('consent_medical', e.target.checked)} />
              I approve emergency medical treatment if required, including hospitalisation, and consent to the school taking my ward to hospital in an emergency.
            </label>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="flex flex-col gap-4">
          <h3 className="font-heading font-bold text-brand-brown-dark">Academic Details</h3>
          <div className="bg-success-soft rounded-md px-4 py-3 border-l-4 border-success-700">
            <div className="text-xs uppercase tracking-wide font-bold text-success-700">Class Assignment</div>
            <div className="text-sm text-success-700">
              Your class will be assigned by the school upon admission approval. You applied for: <strong>{form.class_applied || '(not yet selected)'}</strong>
            </div>
          </div>
        </div>
      )}

      {step === 7 && cbtRequired && cbtExam && (
        <div className="flex flex-col gap-4">
          <h3 className="font-heading font-bold text-[#7C3AED]">Aptitude / Entrance Test</h3>
          <AptitudeTest exam={cbtExam} applicantName={form.full_name} onComplete={setCbtResult} />
        </div>
      )}

      {step === 8 && (
        <div className="flex flex-col gap-4">
          <h3 className="font-heading font-bold text-brand-brown-dark">Payment</h3>
          <div className="bg-gradient-to-br from-brand-brown to-[#8D6E63] text-white rounded-lg px-5 py-4">
            <div className="text-xs uppercase tracking-wide opacity-80 font-semibold">Admission Fee to Pay</div>
            <div className="text-2xl font-extrabold">₦{fee.toLocaleString()}</div>
            <div className="text-xs opacity-80 mt-1">You can pay now, or after submitting — staff can also confirm bank transfer/cash payments.</div>
          </div>
          <div className="flex flex-col gap-2">
            {([
              { key: 'paystack', label: 'Pay Online (Paystack)', desc: 'Card, USSD, Bank Transfer via Paystack' },
              { key: 'transfer', label: 'Bank Transfer', desc: 'Transfer directly to the school bank account' },
              { key: 'cash', label: 'Cash Payment', desc: 'Pay cash at the school office' },
            ] as { key: PayMethod; label: string; desc: string }[]).map((opt) => (
              <label key={opt.key}
                className={`flex items-center gap-3 px-4 py-3 border-2 rounded-md cursor-pointer ${form.payment_method === opt.key ? 'border-brand-gold' : 'border-brand-cream-dark'}`}>
                <input type="radio" name="pay_method" checked={form.payment_method === opt.key}
                  onChange={() => set('payment_method', opt.key)} />
                <div>
                  <div className="font-bold text-sm">{opt.label}</div>
                  <div className="text-xs text-brand-brown-light">{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>

          {form.payment_method === 'paystack' && (
            <div className="bg-info-soft rounded-md p-4 flex flex-col gap-3">
              <label className="text-sm font-medium text-info-700" htmlFor="pay_amount">Amount to Pay Now (₦)</label>
              <input id="pay_amount" type="number" min={1000} step={100} max={fee}
                className="rounded-sm border border-brand-cream-dark px-3 py-2 text-sm"
                value={payAmount} onChange={(e) => setPayAmount(Math.min(parseFloat(e.target.value) || 0, fee))} />
              {payConfirmed ? (
                <div className="bg-success-soft text-success-700 rounded-md px-3 py-2 text-sm font-bold">
                  ✓ Payment confirmed (₦{paystackAmountPaid.toLocaleString()}) — you can submit.
                </div>
              ) : (
                <Button onClick={payWithPaystack} disabled={paystackBusy} className="bg-[#00C3F7] text-white hover:brightness-105">
                  {paystackBusy ? 'Connecting…' : 'Pay Securely with Paystack'}
                </Button>
              )}
              <p className="text-xs text-info-700">
                Opens Paystack checkout in a new tab. Requires <code>PAYSTACK_SECRET_KEY</code> to be set on the
                server — if it isn't configured yet, this will show a clear error instead of a silent failure.
              </p>
            </div>
          )}
          {form.payment_method === 'transfer' && (
            <div className="bg-success-soft rounded-md p-4 text-sm flex flex-col gap-1">
              <div className="font-bold text-success-700 mb-1">Bank Transfer Details</div>
              <div><span className="text-brand-brown-light">Bank:</span> <strong>{settings.bank_name || '(Not configured — contact school)'}</strong></div>
              <div><span className="text-brand-brown-light">Account Name:</span> <strong>{settings.bank_account_name || '(Not configured)'}</strong></div>
              <div><span className="text-brand-brown-light">Account Number:</span> <strong>{settings.bank_account_number || '—'}</strong></div>
              <div className="text-xs text-brand-brown-light mt-1">After transfer, submit this form — our team will confirm your payment.</div>
            </div>
          )}
          {form.payment_method === 'cash' && (
            <div className="bg-warning-soft rounded-md p-4 text-sm">
              <div className="font-bold text-warning-700 mb-1">Cash Payment</div>
              <div>Please visit the school office to make your cash payment.</div>
              <div className="mt-1">Call: <strong>{settings.payment_phone || settings.phone1 || 'Contact school'}</strong></div>
            </div>
          )}
          {submitError && (
            <div className="bg-danger-soft text-danger-700 rounded-md px-4 py-3 text-sm">{submitError}</div>
          )}
        </div>
      )}

      <div className="flex justify-between mt-8">
        {step > 0 ? (
          <Button variant="secondary" onClick={back}>Back</Button>
        ) : <span />}
        {stepPos < activeSteps.length - 1 ? (
          <Button onClick={next}>Next</Button>
        ) : (
          <Button variant="gold" onClick={submit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Application'}
          </Button>
        )}
      </div>
    </div>
  );
}
