import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import { SelectionProvider } from "@/lib/selection";

export const metadata: Metadata = {
  title: "평가원 기출 문제지 생성기",
  description: "평가원 기출 지문·문항을 골라 평가원 스타일 문제지를 자동 생성합니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <SelectionProvider>
          <Header />
          <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
        </SelectionProvider>
      </body>
    </html>
  );
}
