"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "newkice.selection.v1";

interface SelectionContextValue {
  ids: string[];
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  selectMany: (ids: string[]) => void;
  deselectMany: (ids: string[]) => void;
  remove: (id: string) => void;
  move: (id: string, direction: -1 | 1) => void;
  clear: () => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setIds(JSON.parse(raw));
    } catch {
      // corrupt/old storage — start fresh
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }, [ids, hydrated]);

  const value = useMemo<SelectionContextValue>(
    () => ({
      ids,
      isSelected: (id) => ids.includes(id),
      toggle: (id) =>
        setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
      selectMany: (newIds) =>
        setIds((prev) => [...prev, ...newIds.filter((id) => !prev.includes(id))]),
      deselectMany: (removeIds) => setIds((prev) => prev.filter((id) => !removeIds.includes(id))),
      remove: (id) => setIds((prev) => prev.filter((x) => x !== id)),
      move: (id, direction) =>
        setIds((prev) => {
          const idx = prev.indexOf(id);
          if (idx === -1) return prev;
          const swapWith = idx + direction;
          if (swapWith < 0 || swapWith >= prev.length) return prev;
          const next = [...prev];
          [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
          return next;
        }),
      clear: () => setIds([]),
    }),
    [ids]
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useSelection must be used within SelectionProvider");
  return ctx;
}
