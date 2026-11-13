import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { FormAssist } from "@/components/FormAssist";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Mahou · Gestión de visitas",
  description: "Gestión comercial de visitas a supermercados",
  appleWebApp: { capable: true, title: "Mahou", statusBarStyle: "default" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: [{ media: "(prefers-color-scheme: light)", color: "#DE1F26" }, { media: "(prefers-color-scheme: dark)", color: "#96161C" }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("mahou-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}` }} />
      </head>
      <body><FormAssist />{children}</body>
    </html>
  );
}
