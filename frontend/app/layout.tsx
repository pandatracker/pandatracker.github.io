import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const brandFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-brand",
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "pandatracker",
  description: "Structured intelligence on Chinese state-sponsored threat groups.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${brandFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
