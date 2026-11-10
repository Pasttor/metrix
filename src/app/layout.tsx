import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/components/theme/theme";
import { getEnv } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateMetadata(): Metadata {
  const google = getEnv().GOOGLE_SITE_VERIFICATION;
  return {
    title: "Metrix",
    description: "Métricas personales de YouTube, Instagram, Facebook y TikTok",
    // Search Console ownership check for the OAuth verification (docs/GOOGLE-REVIEW.md).
    ...(google ? { verification: { google } } : {}),
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script sets the theme class before paint, so the server markup differs.
    <html
      lang="es-MX"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">{children}</body>
    </html>
  );
}
