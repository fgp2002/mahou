// Etiquetas de motivos por los que una tienda no entra en una ruta (sin dependencias de servidor).
// 24 tiendas + casa = 25 puntos, el máximo de una matriz de Google Routes.
export const MAX_CANDIDATES = 24;
export const UNSCHEDULED_LABEL: Record<string, string> = {
  tiempo: "No cabe en el tiempo disponible de la jornada",
  no_cabe: "Su duración supera por sí sola la jornada",
  sin_ubicacion: "Sin ubicación: no se puede calcular el trayecto",
  fuera_candidatos: `Fuera de las ${MAX_CANDIDATES} tiendas consideradas para la zona del día`,
  limite_paradas: "Superaría el máximo de paradas por día",
  otra_zona: "Queda lejos de la zona de este día: irá en otra ruta",
  limite_audit: "Ya hay suficientes Audit este día: se reparte a otro día",
};
