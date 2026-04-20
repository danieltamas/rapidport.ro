// SmartBill REST client. The ONLY place that talks to ws.smartbill.ro.
// Handlers + the invoice sweep import { createInvoice, cancelInvoice,
// reverseInvoice, getEfacturaStatus } from here.
//
// Auth: HTTP Basic (username:apikey). Confirmed as SmartBill's primary REST
// auth scheme at time of writing; if that ever changes, update in one spot.
//
// Endpoints used:
//   POST   /SBORO/api/invoice                — create invoice (possibly with eFactura auto-submit)
//   DELETE /SBORO/api/invoice?cif&…          — cancel invoice (only valid pre-SPV submission)
//   POST   /SBORO/api/invoice/reverse        — issue storno (creditNote) for a submitted invoice
//   GET    /SBORO/api/invoice/paymentstatus  — query payment + eFactura status
//
// Retry: 3× exponential backoff on 5xx or network errors; fast-fail on 4xx
// (bad payload / bad auth — retrying won't help). No PII in logs: only
// invoice number, status, and error names.
import { env } from './env';

const BASE_URL = 'https://ws.smartbill.ro/SBORO/api';
const MAX_RETRIES = 3;

/**
 * True when all required SmartBill env vars are set to real values (not the
 * dev-safe placeholders declared in env.ts). Callers (e.g. the invoice sweep)
 * short-circuit when false so dev boot stays quiet and prod fails loudly on
 * unset creds at first real issuance attempt.
 */
export function isSmartBillConfigured(): boolean {
  return (
    env.SMARTBILL_USERNAME !== 'dev-noop@example.test' &&
    env.SMARTBILL_API_KEY !== 'dev-noop' &&
    env.SMARTBILL_CIF !== 'RO00000000'
  );
}

export type SmartBillClient =
  | { entity: 'pj'; name: string; cui: string; address: string; regCom?: string; email?: string }
  | { entity: 'pf'; name: string; address?: string; email?: string };

export type CreateInvoiceInput = {
  /** Our internal reference (jobId / stripePaymentIntentId) — lands in the invoice's `mentions`. */
  reference: string;
  client: SmartBillClient;
  /** Gross amount in RON (VAT included). v1 is a single line, 21%. */
  totalRon: number;
  /** Display label for the single product line. */
  description?: string;
};

export type CreatedInvoice = {
  number: string;
  series: string;
  url: string | null;
};

export type StornoInvoice = {
  number: string;
  series: string;
  url: string | null;
};

/** Normalized eFactura lifecycle status. `unknown` = SmartBill returned something we can't classify. */
export type EfacturaStatus = 'pending' | 'validated' | 'rejected' | 'unknown';

export class SmartBillError extends Error {
  constructor(
    public readonly kind: 'auth' | 'validation' | 'server' | 'network' | 'unknown',
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'SmartBillError';
  }
}

function basicAuthHeader(): string {
  const raw = `${env.SMARTBILL_USERNAME}:${env.SMARTBILL_API_KEY}`;
  return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Shared request helper. All primitives go through this so auth, retries,
// and error mapping live in one place.
// ---------------------------------------------------------------------------

type SbRequestOptions = {
  body?: object;
  query?: Record<string, string>;
};

async function sbFetch(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  options: SbRequestOptions = {},
): Promise<Record<string, unknown>> {
  let url = `${BASE_URL}${path}`;
  if (options.query) {
    url += `?${new URLSearchParams(options.query).toString()}`;
  }

  const headers: Record<string, string> = {
    Authorization: basicAuthHeader(),
    Accept: 'application/json',
  };
  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, init);

      if (res.status === 401 || res.status === 403) {
        throw new SmartBillError('auth', res.status, 'smartbill_auth_failed');
      }
      if (res.status >= 400 && res.status < 500) {
        // 4xx — payload or account issue. Don't retry.
        throw new SmartBillError('validation', res.status, `smartbill_validation_${res.status}`);
      }
      if (res.status >= 500) {
        throw new SmartBillError('server', res.status, `smartbill_server_${res.status}`);
      }

      // Some SB endpoints return the JSON body even on 204-style no-content
      // (e.g. DELETE). Try to parse; if empty, return {}.
      const text = await res.text();
      const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};

      // SmartBill sometimes returns 200 with errorText populated.
      if (typeof json.errorText === 'string' && json.errorText.length > 0) {
        throw new SmartBillError('validation', res.status, 'smartbill_reported_error');
      }

      return json;
    } catch (err) {
      lastErr = err;
      const retriable =
        err instanceof SmartBillError
          ? err.kind === 'server' || err.kind === 'network'
          : true;
      if (!retriable || attempt === MAX_RETRIES) break;
      await sleep(500 * 2 ** (attempt - 1));
    }
  }

  if (lastErr instanceof SmartBillError) throw lastErr;
  throw new SmartBillError('network', null, (lastErr as Error)?.name ?? 'unknown');
}

// ---------------------------------------------------------------------------
// Invoice create
// ---------------------------------------------------------------------------

function buildInvoicePayload(input: CreateInvoiceInput): object {
  const clientBlock =
    input.client.entity === 'pj'
      ? {
          name: input.client.name,
          vatCode: input.client.cui,
          // eFactura is only meaningful for PJ; PF invoices don't go through SPV.
          isTaxPayer: input.client.cui.toLowerCase().startsWith('ro'),
          address: input.client.address,
          ...(input.client.regCom ? { regCom: input.client.regCom } : {}),
          ...(input.client.email ? { email: input.client.email } : {}),
        }
      : {
          name: input.client.name,
          isTaxPayer: false,
          ...(input.client.address ? { address: input.client.address } : {}),
          ...(input.client.email ? { email: input.client.email } : {}),
        };

  return {
    companyVatCode: env.SMARTBILL_CIF,
    seriesName: env.SMARTBILL_SERIES,
    client: clientBlock,
    isDraft: false,
    // eFactura auto-submission for PJ invoices (SPV compliance). SmartBill
    // queues these when the account is configured; no-op otherwise.
    useEFactura: input.client.entity === 'pj',
    products: [
      {
        name: input.description ?? 'Conversie migrare WinMentor → SAGA',
        measuringUnitName: 'buc',
        quantity: 1,
        price: input.totalRon,
        currency: 'RON',
        isTaxIncluded: true,
        taxName: 'Normala',
        taxPercentage: 21,
      },
    ],
    mentions: `Ref: ${input.reference}`,
  };
}

export async function createInvoice(input: CreateInvoiceInput): Promise<CreatedInvoice> {
  const json = await sbFetch('POST', '/invoice', { body: buildInvoicePayload(input) });

  const number = typeof json.number === 'string' ? json.number : null;
  if (!number) {
    throw new SmartBillError('unknown', null, 'smartbill_missing_invoice_number');
  }

  return {
    number,
    series: (typeof json.series === 'string' ? json.series : null) ?? env.SMARTBILL_SERIES,
    url: typeof json.url === 'string' ? json.url : null,
  };
}

// ---------------------------------------------------------------------------
// Cancel (pre-SPV delete) — only works while the invoice hasn't been submitted
// to ANAF. On rejection ('already submitted'), callers fall back to reverseInvoice.
// ---------------------------------------------------------------------------

export async function cancelInvoice(series: string, number: string): Promise<void> {
  await sbFetch('DELETE', '/invoice', {
    query: { cif: env.SMARTBILL_CIF, seriesname: series, number },
  });
}

// ---------------------------------------------------------------------------
// Reverse (storno / creditNote) — required after the invoice is at SPV.
// SmartBill auto-submits the storno to ANAF as well.
// ---------------------------------------------------------------------------

export async function reverseInvoice(series: string, number: string): Promise<StornoInvoice> {
  const json = await sbFetch('POST', '/invoice/reverse', {
    body: {
      companyVatCode: env.SMARTBILL_CIF,
      seriesName: series,
      number,
      issueDate: new Date().toISOString().slice(0, 10),
      // Storno must also flow to SPV — Romanian fiscal law requires the
      // creditNote be in eFactura when the original is.
      useEFactura: true,
    },
  });

  const nr = typeof json.number === 'string' ? json.number : null;
  if (!nr) {
    throw new SmartBillError('unknown', null, 'smartbill_missing_storno_number');
  }

  return {
    number: nr,
    series: (typeof json.series === 'string' ? json.series : null) ?? series,
    url: typeof json.url === 'string' ? json.url : null,
  };
}

// ---------------------------------------------------------------------------
// eFactura status query. Used by the refund handler to decide cancel-vs-storno.
// `unknown` is a load-bearing value — callers fall back to the 4h timer when
// SmartBill returns a status string we can't classify.
// ---------------------------------------------------------------------------

export async function getEfacturaStatus(series: string, number: string): Promise<EfacturaStatus> {
  const json = await sbFetch('GET', '/invoice/paymentstatus', {
    query: { cif: env.SMARTBILL_CIF, seriesname: series, number },
  });
  const raw = typeof json.efacturaStatus === 'string' ? json.efacturaStatus.toLowerCase() : '';
  // `submitted` in SmartBill/ANAF parlance means the invoice has already been
  // handed to SPV and is awaiting ANAF validation — past the cancel window.
  // Route it to the validated branch so the refund handler calls reverseInvoice
  // directly instead of trying cancel-then-upgrade.
  if (raw === 'validated' || raw === 'accepted' || raw === 'submitted') return 'validated';
  if (raw === 'rejected' || raw === 'error') return 'rejected';
  if (raw === 'pending' || raw === 'queued') return 'pending';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Invoice-id parsing helper. Our sweep stores `number` but SmartBill endpoints
// want (series, number) separately. Numbers look like "RAPIDPORT-0042" or
// sometimes just "0042" if stored without series prefix.
// ---------------------------------------------------------------------------

export function splitInvoiceId(invoiceId: string): { series: string; number: string } {
  const dash = invoiceId.lastIndexOf('-');
  if (dash <= 0) {
    return { series: env.SMARTBILL_SERIES, number: invoiceId };
  }
  return {
    series: invoiceId.slice(0, dash),
    number: invoiceId.slice(dash + 1),
  };
}
