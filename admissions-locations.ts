// Location data + lookups for the Admissions form's Nationality / State /
// LGA fields (old app: initAdmLocationDropdowns / admOnNatChange /
// admOnStateChange in index.html).
//
// Decision (Phase 0 Section 2.4, confirmed by user): KEEP the CountriesNow
// API for the live country → state → city lookup, but fall back to a
// static list below if it fails or times out, so a dead free API can't
// silently break this part of Admissions the way it could in the old app.

export const NIGERIA_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
  'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
  'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo',
  'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
];

// A compact static fallback country list — used only if the CountriesNow
// fetch fails. Not exhaustive (that's what the live API is for); this just
// keeps the form usable for the most common applicant nationalities.
export const FALLBACK_COUNTRIES = [
  'Nigeria', 'Ghana', 'United Kingdom', 'United States', 'Canada',
  'South Africa', 'Kenya', 'Cameroon', 'Benin', 'Togo', 'Niger',
  'United Arab Emirates', 'India', 'China', 'Germany', 'France',
  'Ireland', 'Australia', 'Other',
].sort((a, b) => (a === 'Nigeria' ? -1 : b === 'Nigeria' ? 1 : a.localeCompare(b)));

const COUNTRIESNOW_BASE = 'https://countriesnow.space/api/v0.1';
const FETCH_TIMEOUT_MS = 6000;

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Returns { countries, source } — source is 'live' or 'fallback'. */
export async function fetchCountries(): Promise<{ countries: string[]; source: 'live' | 'fallback' }> {
  try {
    const res = await fetchWithTimeout(`${COUNTRIESNOW_BASE}/countries/positions`);
    if (!res.ok) throw new Error('bad status');
    const json = await res.json();
    const names: string[] = (json?.data || [])
      .map((c: any) => c?.name)
      .filter(Boolean);
    if (!names.length) throw new Error('empty');
    names.sort((a, b) => (a === 'Nigeria' ? -1 : b === 'Nigeria' ? 1 : a.localeCompare(b)));
    return { countries: names, source: 'live' };
  } catch {
    return { countries: FALLBACK_COUNTRIES, source: 'fallback' };
  }
}

/** For Nigeria we always use the static state list (matches old app's approach). */
export async function fetchStates(country: string): Promise<{ states: string[]; source: 'live' | 'fallback' }> {
  if (country === 'Nigeria') {
    return { states: NIGERIA_STATES, source: 'fallback' };
  }
  try {
    const res = await fetchWithTimeout(`${COUNTRIESNOW_BASE}/countries/states`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country }),
    });
    if (!res.ok) throw new Error('bad status');
    const json = await res.json();
    const states: string[] = (json?.data?.states || []).map((s: any) => s?.name).filter(Boolean);
    if (!states.length) throw new Error('empty');
    return { states, source: 'live' };
  } catch {
    return { states: [], source: 'fallback' };
  }
}

export async function fetchCities(country: string, state: string): Promise<{ cities: string[]; source: 'live' | 'fallback' }> {
  try {
    const res = await fetchWithTimeout(`${COUNTRIESNOW_BASE}/countries/state/cities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, state }),
    });
    if (!res.ok) throw new Error('bad status');
    const json = await res.json();
    const cities: string[] = json?.data || [];
    if (!cities.length) throw new Error('empty');
    return { cities, source: 'live' };
  } catch {
    return { cities: [], source: 'fallback' };
  }
}
