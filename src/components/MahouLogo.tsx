import { LOGO_H, LOGO_W, MASK_M, MASK_REST } from "./logoMasks";

/**
 * Logotipo Mahou tal como es: todo en rojo Mahou sobre fondo claro, o todo en blanco sobre fondo rojo.
 * No se recolorea por partes ni se deforma (se dibuja con la proporción original).
 */
export function MahouLogo({ height = 28, tone = "brand", className = "" }: { height?: number; tone?: "brand" | "white"; className?: string }) {
  const width = Math.round((height * LOGO_W) / LOGO_H);
  const color = tone === "white" ? "#FFFFFF" : "#DE1F26";
  const layer = (mask: string): React.CSSProperties => ({
    position: "absolute", inset: 0, background: color,
    WebkitMaskImage: `url(${mask})`, maskImage: `url(${mask})`,
    WebkitMaskSize: "100% 100%", maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
  });
  return (
    <span role="img" aria-label="Mahou" className={`relative inline-block shrink-0 ${className}`} style={{ width, height }}>
      <span style={layer(MASK_M)} />
      <span style={layer(MASK_REST)} />
    </span>
  );
}

/** Emblema «M» de Mahou (recurso oficial de la marca), para espacios pequeños. */
export function MahouEmblem({ size = 28, tone = "brand", className = "" }: { size?: number; tone?: "brand" | "white"; className?: string }) {
  return (
    <span role="img" aria-label="Mahou" className={`inline-block shrink-0 ${className}`} style={{
      width: size, height: size, background: tone === "white" ? "#FFFFFF" : "#DE1F26",
      WebkitMaskImage: "url(/brand/mahou-m.png)", maskImage: "url(/brand/mahou-m.png)",
      WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center",
    }} />
  );
}
