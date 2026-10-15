import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#CE1A2B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 116, fontWeight: 800 }}>
        M
      </div>
    ),
    size,
  );
}
