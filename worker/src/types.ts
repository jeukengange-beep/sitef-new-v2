export type Bindings = {
  ORIGIN: string;
  OPENAI_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  PEXELS_API_KEY?: string;
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
