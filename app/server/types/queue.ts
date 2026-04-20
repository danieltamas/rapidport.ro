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
};

/** pg-boss `discover` job payload — matches DiscoverPayload in consumer.py. */
export type DiscoverPayload = {
  job_id: string; // UUID
  input_path: string;
};
