import { LOGO_H, LOGO_W, MASK_M, MASK_REST } from "./logoMasks";

/** Logotipo único: «M» en rojo de marca y «ahou» en blanco (en tema claro, en el color del texto para que se lea). */
export function MahouLogo({ height = 28, className = "" }: { height?: number; className?: string }) {
  const width = Math.round((height * LOGO_W) / LOGO_H);
  const layer = (mask: string): React.CSSProperties => ({
    position: "absolute", inset: 0,
    WebkitMaskImage: `url(${mask})`, maskImage: `url(${mask})`,
    WebkitMaskSize: "100% 100%", maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
  });
  return (
    <span role="img" aria-label="Mahou" className={`relative inline-block shrink-0 text-slate-900 ${className}`} style={{ width, height }}>
      <span style={{ ...layer(MASK_M), background: "#DE1F26" }} />
      <span style={{ ...layer(MASK_REST), background: "currentColor" }} />
    </span>
  );
}
