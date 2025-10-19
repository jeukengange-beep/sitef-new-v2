import type { D1Database } from '@cloudflare/workers-types';

export type Bindings = {
  DB: D1Database;
  ORIGIN: string;
  OPENAI_API_KEY?: string;
  PEXELS_API_KEY?: string;
};

export type Env = {
  Bindings: Bindings;
};

export type ProjectRecord = {
  id: number;
  name: string;
  created_at: string;
};
