// demoanaf.ro API client. Public GET endpoint, no auth. Docs owner: Dani.
//
// The upstream API has async VAT resolution: the first call returns
// `vatStatus: "verifying"` with identity fields (name, address) present and
// VAT/fiscal fields absent. Caller must retry the same URL ~3-5s later to get
// the resolved record. We do NOT poll from the server — the client polls via
// repeated calls to /api/anaf/lookup so the user sees the name immediately and
// the VAT badge updates in place.
//
// The app-side endpoint (api/anaf/lookup.post.ts) is a thin proxy: it calls
// this util once, normalizes the shape, returns. No server cache — demoanaf
// has Redis upstream.
import { env } from './env';

const BASE_URL = 'https://demoanaf.ro/api';
const TIMEOUT_MS = 8_000;

export type AnafCompany = {
  /** Numeric CUI as returned by ANAF (no 'RO' prefix). */
  cui: number;
  /** 'RO'-prefixed version for SmartBill. */
  cuiRo: string;
  name: string;
  /** Flat one-line address (ANAF's pre-composed string). */
  address: string;
  /** Structured counterpart — useful for SmartBill split fields. */
  headquarters: {
    street: string;
    number: string;
    locality: string;
    county: string;
    country: string;
    postalCode: string;
  };
  registrationNumber: string; // J-code
  registrationDate: string;   // DD/MM/YYYY
  legalForm: string;
  caenCode: string;
  phone: string;
  vatRegistered: boolean;
  cashBasisVat: boolean;
  splitVat: boolean;
  eFacturaRegistered: boolean;
  inactive: boolean;
  onrcStatusLabel: string;
  vatCheckedAt: string | null;
  /** 'verifying' | 'fresh' | other — caller polls until !== 'verifying'. */
  vatStatus: string;
  /** ISO 8601 when WE received this response. Caller stamps on billingInfo. */
  fetchedAt: string;
};

export class AnafError extends Error {
  constructor(
    public readonly kind: 'not-found' | 'rate-limited' | 'upstream' | 'network' | 'invalid-cui',
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'AnafError';
  }
}

/**
 * Normalize a CUI string to its numeric form. Accepts 'RO12345678', 'ro12345678',
 * '12345678', '  12345678 '. Returns null when the input can't be parsed to a
 * positive integer in the expected 2–10 digit range.
 */
export function normalizeCui(input: string): number | null {
  const cleaned = input.trim().replace(/^[Rr][Oo]/, '').replace(/\s+/g, '');
  if (!/^\d{2,10}$/.test(cleaned)) return null;
  const n = Number.parseInt(cleaned, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Fetch a company by numeric CUI. One call — no polling. Caller polls via
 * repeated calls when `vatStatus === 'verifying'`.
 */
export async function fetchCompany(cui: number): Promise<AnafCompany> {
  const url = `${BASE_URL}/company/${cui}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': `rapidport/${env.APP_URL}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new AnafError('network', null, (err as Error).name);
  }

  if (res.status === 429) throw new AnafError('rate-limited', 429, 'demoanaf_rate_limited');
  if (res.status === 404) throw new AnafError('not-found', 404, 'cui_not_found');
  if (res.status >= 500) throw new AnafError('upstream', res.status, `demoanaf_${res.status}`);
  if (!res.ok) throw new AnafError('upstream', res.status, `demoanaf_${res.status}`);

  const body = (await res.json()) as {
    success?: boolean;
    data?: Record<string, unknown>;
  };

  if (!body.success || !body.data) {
    throw new AnafError('upstream', res.status, 'demoanaf_unexpected_shape');
  }
  const d = body.data;

  // demoanaf returns a success:true + verifying-placeholder for unknown CUIs too.
  // Detect via missing name/registrationNumber once VAT is resolved.
  const name = typeof d.name === 'string' ? d.name : '';
  const vatStatus = typeof d.vatStatus === 'string' ? d.vatStatus : '';
  if (vatStatus !== 'verifying' && name.length === 0) {
    throw new AnafError('not-found', 200, 'cui_not_found');
  }

  const hq =
    (d.headquartersAddress as Record<string, string> | undefined) ?? {
      street: '',
      number: '',
      locality: '',
      county: '',
      country: '',
      postalCode: '',
    };

  return {
    cui: Number(d.cui ?? cui),
    cuiRo: `RO${Number(d.cui ?? cui)}`,
    name,
    address: typeof d.address === 'string' ? d.address : '',
    headquarters: {
      street: hq.street ?? '',
      number: hq.number ?? '',
      locality: hq.locality ?? '',
      county: hq.county ?? '',
      country: hq.country ?? '',
      postalCode: (hq.postalCode ?? '').trim(),
    },
    registrationNumber: typeof d.registrationNumber === 'string' ? d.registrationNumber : '',
    registrationDate: typeof d.registrationDate === 'string' ? d.registrationDate : '',
    legalForm: typeof d.legalForm === 'string' ? d.legalForm : '',
    caenCode: typeof d.caenCode === 'string' ? d.caenCode : '',
    phone: typeof d.phone === 'string' ? d.phone : '',
    vatRegistered: Boolean(d.vatRegistered),
    cashBasisVat: Boolean(d.cashBasisVat),
    splitVat: Boolean(d.splitVat),
    eFacturaRegistered: Boolean(d.eFacturaRegistered),
    inactive: Boolean(d.inactive),
    onrcStatusLabel: typeof d.onrcStatusLabel === 'string' ? d.onrcStatusLabel : '',
    vatCheckedAt: typeof d.vatCheckedAt === 'string' ? d.vatCheckedAt : null,
    vatStatus,
    fetchedAt: new Date().toISOString(),
  };
}
