export interface Env {
  WRITER_OS_API_SECRET: string;
  DATABASE_URL: string;
  ANTHROPIC_API_KEY: string;
  ELEVENLABS_API_KEY?: string;
  // Optional. Defaults to 0.80 when unset.
  WRITER_OS_TRIAGE_HIGH_CONFIDENCE?: string;
  // Optional. Defaults to 0.50 when unset.
  WRITER_OS_TRIAGE_LOW_CONFIDENCE?: string;
  ENVIRONMENT: string;
}
