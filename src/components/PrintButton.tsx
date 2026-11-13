"use client";
import { Printer } from "lucide-react";

/** Abre el diálogo de impresión: en Android y en el ordenador permite «Guardar como PDF». */
export function PrintButton({ label = "PDF" }: { label?: string }) {
  return <button type="button" className="btn no-print" onClick={() => window.print()}><Printer size={16} /> {label}</button>;
}
