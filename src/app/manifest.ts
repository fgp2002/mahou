import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mahou · Gestión de visitas",
    short_name: "Mahou",
    description: "Gestión comercial de visitas a supermercados",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#DE1F26",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
