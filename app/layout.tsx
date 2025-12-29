import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Watermark Remover & Voiceover",
  description: "Remove watermarks and add voiceovers to your videos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
