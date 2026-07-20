import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GEO Scan — does the AI even know you exist",
  description: "AI visibility audits for Indian businesses, with drafted fixes and one-click publishing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#0B1220] text-[#E7ECF7] font-sans">{children}</body>
    </html>
  );
}
