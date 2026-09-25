import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { getEnv } from "@/env";
import "./globals.css";
import { Providers } from "./providers";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ScalePods",
  description: "Recruiting, automated.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  getEnv();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
