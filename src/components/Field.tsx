"use client";
import { useId } from "react";
import clsx from "clsx";

type Common = { label: string; value: string; onChange: (v: string) => void; className?: string; required?: boolean; id?: string };

/** Campo con etiqueta flotante. Para desplegables pasa `options`; para texto largo `rows`. */
export function Field({ label, value, onChange, className, required, id, type = "text", inputMode, autoComplete, rows, options, maxLength }: Common & {
  type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; autoComplete?: string; rows?: number; options?: [string, string][]; maxLength?: number;
}) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={clsx("ff", className)}>
      {options ? (
        <select id={fid} className="input" value={value} onChange={(e) => onChange(e.target.value)} required={required}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : rows ? (
        <textarea id={fid} className="input" rows={rows} placeholder=" " value={value} onChange={(e) => onChange(e.target.value)} required={required} maxLength={maxLength} />
      ) : (
        <input id={fid} className="input" type={type} inputMode={inputMode} autoComplete={autoComplete} placeholder=" " value={value} onChange={(e) => onChange(e.target.value)} required={required} maxLength={maxLength} />
      )}
      <label htmlFor={fid}>{label}{required ? " *" : ""}</label>
    </div>
  );
}
