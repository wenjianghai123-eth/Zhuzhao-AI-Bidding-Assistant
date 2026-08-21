import { Geist } from "next/font/google";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: {
    default: "烛照AI投标助手",
    template: "%s | 烛照AI投标助手",
  },
  description: "面向建筑工程投标业务的多场景测算与辅助决策平台",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className={cn("font-sans", geist.variable)}>
      <body className="min-h-svh antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
