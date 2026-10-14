import type { Frequency } from "./domain/periodicity.ts";

export interface Store {
  id: string;
  source_id: string | null;
  name: string;
  banner: string | null;
  chain: string | null;
  macro_chain: string | null;
  store_type: string | null;
  area: string | null;
  kam: string | null;
  address: string | null;
  town: string | null;
  postal_code: string | null;
  province: string | null;
  lat: number | null;
  lng: number | null;
  geocode_status: "pending" | "ok" | "partial" | "failed" | "manual";
  geocode_formatted: string | null;
  gpv: string | null;
  frequency: Frequency;
  audit: boolean;
  notes: string | null;
  active: boolean;
  manual_overrides: string[];
}

export interface Visit {
  id: string;
  store_id: string;
  visit_date: string;
  status: "planned" | "in_progress" | "completed" | "cancelled";
  visit_type: string;
  planned_minutes: number | null;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number | null;
  is_manual: boolean;
  contact_name_snapshot: string | null;
  result: string | null;
  notes: string | null;
  incidents: string | null;
  items_reviewed: string | null;
}

export const VISIT_TYPES: Record<string, string> = {
  ordinaria: "Ordinaria",
  acomodo_nevera: "Acomodo de nevera",
  con_reposicion: "Con reposición",
  sin_reposicion: "Sin reposición",
  otra: "Otra",
};

export const CONCEPTS: Record<string, string> = {
  expositor: "Expositor",
  nevera: "Nevera",
  cabecera: "Cabecera",
  expositor_fijo: "Expositor fijo",
  bajo_cross: "Bajo cross",
  dispensador: "Dispensador",
};

export const FREQ_LABEL: Record<string, string> = {
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
  ninguna: "Sin periodicidad",
};

export const DEFAULT_DURATIONS: Record<string, number> = {
  ordinaria: 60,
  acomodo_nevera: 45,
  con_reposicion: 60,
  sin_reposicion: 30,
  otra: 30,
};
