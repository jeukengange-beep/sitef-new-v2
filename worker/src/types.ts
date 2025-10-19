export type Bindings = {
  DB: D1Database;
  ORIGIN: string;
  OPENAI_API_KEY?: string;
};

export type Env = {
  Bindings: Bindings;
};

export type ProjectRecord = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
};
