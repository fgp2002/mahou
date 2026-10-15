import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#CE1A2B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 330, fontWeight: 800, borderRadius: 112 }}>
        M
      </div>
    ),
    size,
  );
}
