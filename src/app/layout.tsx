import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-ibm-plex-mono",
});

export const metadata: Metadata = {
  title: "THE SLOWED AND REVERB MACHINE",
  description: "Slowed + reverb audio processor with vintage hi-fi aesthetic",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "THE SLOWED AND REVERB MACHINE",
    description: "Slowed + reverb audio processor with vintage hi-fi aesthetic",
    url: "https://slowedandreverbed.com",
    siteName: "THE SLOWED AND REVERB MACHINE",
    images: [{ url: "https://slowedandreverbed.com/og.png", width: 1312, height: 940 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "THE SLOWED AND REVERB MACHINE",
    description: "Slowed + reverb audio processor with vintage hi-fi aesthetic",
    images: ["https://slowedandreverbed.com/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${ibmPlexMono.variable} font-mono antialiased`}>
        {children}
      </body>
    </html>
  );
}
