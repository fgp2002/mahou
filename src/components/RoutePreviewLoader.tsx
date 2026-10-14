"use client";
import dynamic from "next/dynamic";
import type { PreviewStop } from "./RoutePreview";

const RoutePreview = dynamic(() => import("./RoutePreview").then((m) => m.RoutePreview), {
  ssr: false,
  loading: () => <div className="skeleton h-72 w-full md:h-96" />,
});

export function RoutePreviewLoader(props: { stops: PreviewStop[]; start: { lat: number; lng: number } | null; polyline: string | null }) {
  return <RoutePreview {...props} />;
}
