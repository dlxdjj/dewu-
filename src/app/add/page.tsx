"use client";

import { useRouter } from "next/navigation";
import PurchaseForm from "@/components/add/PurchaseForm";

export default function AddPage() {
  const router = useRouter();
  return <PurchaseForm onComplete={() => router.push("/inventory")} />;
}
