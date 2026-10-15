import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mahou · Gestión de visitas",
    short_name: "Mahou",
    description: "Gestión comercial de visitas a supermercados",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#CE1A2B",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
