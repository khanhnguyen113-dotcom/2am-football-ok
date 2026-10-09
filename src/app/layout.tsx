import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

const display = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
});

const body = Be_Vietnam_Pro({
  variable: "--font-bevn",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "2AM FC — Quỹ đội & Lịch thi đấu", template: "%s · 2AM FC" },
  description: "Dashboard công khai của 2AM FC: quỹ đội, khoản chi, lịch đá, đội hình sân 7, nhiệm vụ, thưởng và thống kê.",
  icons: { icon: "/brand/logo.webp", apple: "/brand/logo.webp" },
};

export const viewport: Viewport = {
  themeColor: "#071217",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="pitch-bg min-h-full">{children}</body>
    </html>
  );
}
