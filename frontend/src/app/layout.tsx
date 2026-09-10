import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeshDiff — 3D Asset Version Control & Diff Viewer",
  description: "Visual 3D model diffing tool for game developers & technical artists.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen flex flex-col">{children}</body>
    </html>
  );
}
