import { getSupabase } from "@/lib/supabase/client";
import type {
  ClearResult,
  DbAdapter,
  DeleteResult,
  PurchaseResult,
  ShipUnitsResult,
} from "@/lib/data/types";
import type {
  Attachment,
  InventoryUnit,
  MonthlyRebate,
  Product,
  PurchaseBatch,
  Sale,
  ShippingEvent,
  ShippingEventItem,
  StatusHistory,
} from "@/lib/types/database";
import { DataAccessError, withDataTimeout } from "@/lib/data/errors";
import { cachedRead, invalidateDataCache } from "@/lib/data/cache";

const BUCKET = "attachments";

type QueryError = { message: string; code?: string } | null;
type QueryResponse<T> = { data: T | null; error: QueryError };

function unwrap<T>(data: T | null, error: QueryError): T {
  if (error) throw new DataAccessError(error.message, error.code !== "42501");
  if (data == null) throw new DataAccessError("服务器未返回数据");
  return data;
}

function unwrapVoid(error: QueryError): void {
  if (error) throw new DataAccessError(error.message, error.code !== "42501");
}

async function request<T>(query: PromiseLike<QueryResponse<T>>): Promise<T> {
  const response = await withDataTimeout(query);
  return unwrap(response.data, response.error);
}

async function requestVoid(
  query: PromiseLike<QueryResponse<unknown>>,
): Promise<void> {
  const response = await withDataTimeout(query);
  unwrapVoid(response.error);
}

/** Create the authenticated Supabase data adapter. */
export function createSupabaseAdapter(): DbAdapter {
  const client = getSupabase();
  let namespacePromise: Promise<string> | null = null;
  const cacheNamespace = () => {
    if (!client.auth?.getSession) return Promise.resolve("adapter-default");
    namespacePromise ??= withDataTimeout(client.auth.getSession()).then(({ data, error }) => {
      if (error) throw new DataAccessError(error.message, false);
      return data.session?.user.id ?? "signed-out";
    });
    return namespacePromise;
  };
  const cached = async <T>(key: string, loader: () => Promise<T>): Promise<T> =>
    cachedRead(await cacheNamespace(), key, loader);
  const afterMutation = async <T>(work: Promise<T>): Promise<T> => {
    const result = await work;
    await invalidateDataCache(await cacheNamespace());
    return result;
  };
  const rpc = async <T>(
    name: string,
    params: Record<string, unknown>,
  ): Promise<T> =>
    request<T>(client.rpc(name, params) as PromiseLike<QueryResponse<T>>);
  const rpcVoid = async (
    name: string,
    params: Record<string, unknown>,
  ): Promise<void> =>
    requestVoid(
      client.rpc(name, params) as PromiseLike<QueryResponse<unknown>>,
    );

  async function removePending<T extends ClearResult | DeleteResult>(
    result: T,
  ): Promise<T> {
    if (!result.pendingStoragePaths.length) return result;
    const removal = await withDataTimeout(
      client.storage.from(BUCKET).remove(result.pendingStoragePaths),
    );
    if (!removal.error) {
      await rpcVoid("ack_storage_deletions", {
        p_paths: result.pendingStoragePaths,
      });
    }
    return removal.error ? result : { ...result, pendingStoragePaths: [] };
  }

  return {
    kind: "supabase",
    listProducts: () => cached("products", () =>
      request<Product[]>(
        client
          .from("products")
          .select("*")
          .order("created_at") as PromiseLike<QueryResponse<Product[]>>,
      )),
    listBatches: () => cached("batches", () =>
      request<PurchaseBatch[]>(
        client
          .from("purchase_batches")
          .select("*")
          .order("purchased_at", { ascending: false }) as PromiseLike<
          QueryResponse<PurchaseBatch[]>
        >,
      )),
    listUnits: () => cached("units", () =>
      request<InventoryUnit[]>(
        client
          .from("inventory_units")
          .select("*")
          .order("created_at", { ascending: false }) as PromiseLike<
          QueryResponse<InventoryUnit[]>
        >,
      )),
    listSales: () => cached("sales", () =>
      request<Sale[]>(
        client.from("sales").select("*") as PromiseLike<QueryResponse<Sale[]>>,
      )),
    async listRebates() {
      return cached("rebates", async () => {
        const response = await withDataTimeout(
          client.from("monthly_rebates").select("*").order("month", { ascending: false }) as PromiseLike<QueryResponse<MonthlyRebate[]>>,
        );
        if (["42P01", "PGRST205"].includes(response.error?.code ?? "")) return [];
        return unwrap(response.data, response.error);
      });
    },
    async listShippingEvents() {
      return cached("shipping-events", async () => {
        const response = await withDataTimeout(
          client.from("shipping_events").select("*").order("shipped_at", { ascending: false }) as PromiseLike<QueryResponse<ShippingEvent[]>>,
        );
        if (["42P01", "PGRST205"].includes(response.error?.code ?? "")) return [];
        return unwrap(response.data, response.error);
      });
    },
    async listShippingEventItems() {
      return cached("shipping-event-items", async () => {
        const response = await withDataTimeout(
          client.from("shipping_event_items").select("*") as PromiseLike<QueryResponse<ShippingEventItem[]>>,
        );
        if (["42P01", "PGRST205"].includes(response.error?.code ?? "")) return [];
        return unwrap(response.data, response.error);
      });
    },
    listHistory: (unitId) => {
      let query = client
        .from("status_history")
        .select("*")
        .order("created_at");
      if (unitId) query = query.eq("unit_id", unitId);
      return request<StatusHistory[]>(
        query as PromiseLike<QueryResponse<StatusHistory[]>>,
      );
    },
    listAttachments: (ownerType, ownerId) => {
      let query = client
        .from("attachments")
        .select("*")
        .eq("owner_type", ownerType)
        .order("created_at");
      if (ownerId) query = query.eq("owner_id", ownerId);
      return request<Attachment[]>(
        query as PromiseLike<QueryResponse<Attachment[]>>,
      );
    },
    async attachmentUrl(attachment) {
      const response = await withDataTimeout(
        client.storage.from(BUCKET).createSignedUrl(attachment.path, 900),
      );
      return unwrap(response.data, response.error).signedUrl;
    },
    async saveAttachment(input) {
      const auth = await withDataTimeout(client.auth.getUser());
      if (auth.error) throw new DataAccessError(auth.error.message, false);
      const uid = auth.data.user?.id;
      if (!uid) throw new DataAccessError("请先登录", false);
      const path = `${uid}/${input.owner_type}/${input.owner_id}/${crypto.randomUUID()}`;
      const upload = await withDataTimeout(
        client.storage.from(BUCKET).upload(path, input.file, {
          contentType: input.file.type || undefined,
        }),
      );
      if (upload.error) throw new DataAccessError(upload.error.message);
      try {
        return await rpc<Attachment>("create_attachment", {
          p_owner_type: input.owner_type,
          p_owner_id: input.owner_id,
          p_kind: input.kind,
          p_path: path,
          p_content_type: input.file.type || null,
        });
      } catch (reason) {
        // Reconcile first: an RPC timeout may still have committed metadata.
        const lookup = await withDataTimeout(
          client
            .from("attachments")
            .select("*")
            .eq("path", path)
            .limit(1) as PromiseLike<QueryResponse<Attachment[]>>,
        ).catch(() => null);
        const committed = lookup && !lookup.error ? lookup.data?.[0] : null;
        if (committed) return committed;
        if (lookup && !lookup.error) {
          await withDataTimeout(
            client.storage.from(BUCKET).remove([path]),
          ).catch(() => undefined);
        }
        throw reason;
      }
    },
    createPurchase: (input) => afterMutation(
      rpc<PurchaseResult>("create_purchase_simple", { p_input: input }),
    ),
    shipUnits: (input) =>
      afterMutation(rpc<ShipUnitsResult>("record_shipment", {
        p_unit_ids: input.unitIds,
        p_total_shipping_cents: input.totalShippingCents,
        p_mode: input.mode,
        p_shipped_at: input.shippedAt,
      })),
    async settleUnits(input) {
      await afterMutation(rpcVoid("settle_units", {
        p_unit_ids: input.unitIds,
        p_actual_payout_cents: input.actualPayoutCents,
        p_settled_at: input.settledAt,
      }));
    },
    async changeStatus(input) {
      await afterMutation(rpcVoid("change_units_status", {
        p_unit_ids: input.unitIds,
        p_to_status: input.toStatus,
        p_note: input.note ?? null,
      }));
    },
    async refundUnit(input) {
      await afterMutation(rpcVoid("refund_unit", {
        p_unit_id: input.unitId,
        p_note: input.note ?? null,
      }));
    },
    saveMonthlyRebates: (input) => afterMutation(
      rpc<MonthlyRebate[]>("save_monthly_rebates", {
        p_month: input.month,
        p_taobao_alliance_cents: input.taobaoAllianceCents,
        p_jingfen_cents: input.jingfenCents,
      }),
    ),
    async deleteUnitDeep(input) {
      return afterMutation(removePending(
        await rpc<DeleteResult>("delete_unit_deep", {
          p_unit_id: input.unitId,
        }),
      ));
    },
    async clearAllData(input) {
      return afterMutation(removePending(
        await rpc<ClearResult>("clear_all_data", {
          p_confirmation: input.confirmation,
        }),
      ));
    },
    async retryStorageCleanup() {
      const rows = await request<{ path: string }[]>(
        client
          .from("storage_deletion_jobs")
          .select("path")
          .is("completed_at", null) as PromiseLike<
          QueryResponse<{ path: string }[]>
        >,
      );
      const paths = rows.map((row) => row.path);
      if (!paths.length) {
        return { attempted: 0, completed: 0, pending: 0, failedPaths: [] };
      }
      const removal = await withDataTimeout(
        client.storage.from(BUCKET).remove(paths),
      );
      if (removal.error) {
        return {
          attempted: paths.length,
          completed: 0,
          pending: paths.length,
          failedPaths: paths,
        };
      }
      await rpcVoid("ack_storage_deletions", { p_paths: paths });
      return {
        attempted: paths.length,
        completed: paths.length,
        pending: 0,
        failedPaths: [],
      };
    },
  };
}
