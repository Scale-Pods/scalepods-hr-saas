import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getEnv } from "@/env";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ScalePods",
  description: "Recruiting, automated.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  getEnv();

  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
