import { notFound } from "next/navigation";
import ThemeQaClient from "./ThemeQaClient";

export default function ThemeQaPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ThemeQaClient />;
}
