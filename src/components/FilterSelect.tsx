"use client";
import { useId } from "react";

/** Desplegable de filtro: el nombre del filtro queda fijo arriba y la primera opción es «Todos/Todas». */
export function FilterSelect({ label, value, onChange, options, all = "Todos" }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][]; all?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
