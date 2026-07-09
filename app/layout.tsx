import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Web Page Cloner",
  description: "Clone any web page with all styles and assets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
