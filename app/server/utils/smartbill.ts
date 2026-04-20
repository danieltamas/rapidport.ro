// SmartBill REST client. The ONLY place that talks to ws.smartbill.ro.
// Handlers + the invoice sweep import { createInvoice } from here.
//
// Auth: HTTP Basic (username:apikey). Confirmed as SmartBill's primary REST
// auth scheme at time of writing; if that ever changes, update in one spot.
//
// Endpoint: POST https://ws.smartbill.ro/SBORO/api/invoice
// Response (representative): { number, series, url }.
//
// Retry: 3× exponential backoff on 5xx or network errors; fast-fail on 4xx
// (bad payload / bad auth — retrying won't help). No PII in logs: only
// invoice number, status, and error names.
import { env } from './env';

const BASE_URL = 'https://ws.smartbill.ro/SBORO/api';
const MAX_RETRIES = 3;

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
  const body = JSON.stringify(buildInvoicePayload(input));

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/invoice`, {
        method: 'POST',
        headers: {
          'Authorization': basicAuthHeader(),
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body,
      });

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

      const json = (await res.json()) as {
        number?: string;
        series?: string;
        url?: string | null;
        errorText?: string;
      };

      // SmartBill sometimes returns 200 with errorText populated.
      if (json.errorText) {
        throw new SmartBillError('validation', res.status, `smartbill_reported_error`);
      }
      if (!json.number) {
        throw new SmartBillError('unknown', res.status, 'smartbill_missing_invoice_number');
      }

      return {
        number: json.number,
        series: json.series ?? env.SMARTBILL_SERIES,
        url: json.url ?? null,
      };
    } catch (err) {
      lastErr = err;
      const retriable =
        err instanceof SmartBillError
          ? err.kind === 'server' || err.kind === 'network'
          : true; // native fetch rejections (DNS, socket) are retriable
      if (!retriable || attempt === MAX_RETRIES) {
        break;
      }
      await sleep(500 * 2 ** (attempt - 1));
    }
  }

  if (lastErr instanceof SmartBillError) throw lastErr;
  throw new SmartBillError('network', null, (lastErr as Error)?.name ?? 'unknown');
}
