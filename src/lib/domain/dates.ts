// Utilidades de fecha con zona horaria Europe/Madrid.
// Las fechas "de calendario" se manejan como cadenas ISO YYYY-MM-DD.

export const TZ = "Europe/Madrid";

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface MadridParts {
  y: number;
  m: number;
  d: number;
  hour: number;
  minute: number;
}

export function madridParts(date: Date): MadridParts {
  const out: Record<string, number> = {};
  for (const p of partsFmt.formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return { y: out.year, m: out.month, d: out.day, hour: out.hour, minute: out.minute };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha de calendario (YYYY-MM-DD) en Madrid para un instante dado. */
export function madridDate(date: Date = new Date()): string {
  const p = madridParts(date);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function madridHour(date: Date = new Date()): number {
  return madridParts(date).hour;
}

function toUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): string {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addDays(iso: string, n: number): string {
  return fromUTC(toUTC(iso) + n * 86400000);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(a) - toUTC(b)) / 86400000);
}

/** 0 = lunes … 6 = domingo */
export function weekdayMon0(iso: string): number {
  const dow = new Date(toUTC(iso)).getUTCDay(); // 0 = domingo
  return (dow + 6) % 7;
}

export function weekStart(iso: string): string {
  return addDays(iso, -weekdayMon0(iso));
}

export function weekEnd(iso: string): string {
  return addDays(weekStart(iso), 6);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthStart(iso: string): string {
  return iso.slice(0, 7) + "-01";
}

export function monthEnd(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`;
}

export function parseHM(s: string | null | undefined, fallback = 0): number {
  if (!s) return fallback;
  const [h, m] = s.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return fallback;
  return h * 60 + m;
}

export function fmtHM(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${pad(h)}:${pad(m)}`;
}

export function fmtDuration(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const longFmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatLong(iso: string): string {
  return longFmt.format(new Date(toUTC(iso)));
}

const shortFmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
});

export function formatShort(iso: string): string {
  return shortFmt.format(new Date(toUTC(iso)));
}

const dayFmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function formatDay(iso: string): string {
  return dayFmt.format(new Date(toUTC(iso)));
}

/** Hora local de Madrid (HH:MM) para un instante ISO. */
export function madridTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = madridParts(new Date(iso));
  return `${pad(p.hour)}:${pad(p.minute)}`;
}
