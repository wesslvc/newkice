"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSelection } from "@/lib/selection";
import clsx from "clsx";

const NAV = [
  { href: "/", label: "홈" },
  { href: "/bank", label: "문제은행" },
  { href: "/generate", label: "문제지 생성" },
];

export default function Header() {
  const pathname = usePathname();
  const { ids } = useSelection();

  return (
    <header className="border-b border-gray-200 bg-white sticky top-0 z-10 no-print">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/" className="font-bold text-brand-700">
          평가원 기출 문제지 생성기
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                pathname === item.href
                  ? "bg-brand-100 text-brand-700"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              {item.label}
              {item.href === "/generate" && ids.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-brand-600 text-white text-xs w-5 h-5">
                  {ids.length}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
