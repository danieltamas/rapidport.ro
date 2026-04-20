// Mirror of Pydantic models in worker/src/migrator/consumer.py.
//
// Field names are snake_case to match the Pydantic shapes byte-for-byte. The Python
// worker validates incoming pg-boss payloads with these exact keys; drift here would
// cause silent job drops at runtime. If you change either side, update both.

/** pg-boss `convert` job payload — matches ConvertPayload in consumer.py. */
export type ConvertPayload = {
  job_id: string; // UUID
  input_path: string;
  output_dir: string;
  a1_articles?: boolean; // default false in Pydantic
  a1_warehouses?: boolean; // default false in Pydantic
  mapping_profile?: string | null;
  /**
   * True when this convert run is a delta-sync (resync) rather than the initial
   * conversion. Set by POST /api/jobs/[id]/resync; the Stripe webhook omits it
   * (defaults to false). Worker stamps `jobs.last_run_was_resync` accordingly
   * so the future sync-complete email sweep can distinguish initial vs. resync.
   */
  is_resync?: boolean; // default false in Pydantic
};

/** pg-boss `discover` job payload — matches DiscoverPayload in consumer.py. */
export type DiscoverPayload = {
  job_id: string; // UUID
  input_path: string;
};
