import type { AccountWorkflow } from "@/lib/types/database";

/** The standard account is the owner's full workflow; bulk accounts are importer-only. */
export function supportsRebateIncome(workflow: AccountWorkflow): boolean {
  return workflow === "standard";
}
