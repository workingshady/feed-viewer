import { useContext } from "react";
import { DataContext } from "@/providers/dataContext";

export function useAppData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useAppData must be used within DataProvider");
  return ctx;
}
