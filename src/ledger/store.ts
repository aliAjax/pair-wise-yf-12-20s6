import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type {
  ConflictItem,
  DispatchOrder,
  OpChanges,
  PendingOp,
  Station
} from "./types";
import { addHours, nextHourSlot } from "./slots";
import { applyOps, loadServer, pushStations, remoteReassign, setServerOutage } from "./server";

/** 本地待同步队列与冲突清单独立持久化，刷新/断网后可续作 */
const CLIENT_KEY = "hxwlfront-21-ledger-client";

interface ClientState {
  queue: PendingOp[];
  conflicts: ConflictItem[];
}

function loadClient(): ClientState {
  try {
    const raw = localStorage.getItem(CLIENT_KEY);
    if (raw) return JSON.parse(raw) as ClientState;
  } catch {
    // 本地缓存损坏时按空队列续作
  }
  return { queue: [], conflicts: [] };
}

/** 去掉与基线一致的字段，只保留真实变更 */
function effectiveChanges(baseline: PendingOp["baseline"], changes: OpChanges): OpChanges {
  const out: OpChanges = {};
  if (changes.stationId !== undefined && changes.stationId !== baseline.stationId) out.stationId = changes.stationId;
  if (changes.volume !== undefined && changes.volume !== baseline.volume) out.volume = changes.volume;
  if (changes.slot !== undefined && changes.slot !== baseline.slot) out.slot = changes.slot;
  return out;
}

export type ReassignResult =
  | { ok: true }
  | { ok: false; reason: string; earliest?: string };

export const useLedgerStore = defineStore("ledger", () => {
  const serverSnap = loadServer();
  const client = loadClient();

  /** 已确认结果：地图、库存统计、待处理清单共同读取的唯一真源 */
  const stations = ref<Station[]>(serverSnap.stations);
  const orders = ref<DispatchOrder[]>(serverSnap.orders);
  const queue = ref<PendingOp[]>(client.queue);
  const conflicts = ref<ConflictItem[]>(client.conflicts);

  const online = ref(true);
  const outage = ref(false);
  const syncing = ref(false);
  const lastSyncAt = ref<string | null>(null);
  const notice = ref("");
  let noticeTimer: number | undefined;

  function say(message: string) {
    notice.value = message;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => {
      notice.value = "";
    }, 6000);
  }

  function persistClient() {
    const state: ClientState = { queue: queue.value, conflicts: conflicts.value };
    localStorage.setItem(CLIENT_KEY, JSON.stringify(state));
  }

  /** 从服务端拉取最新已确认台账 */
  function pullConfirmed() {
    const fresh = loadServer();
    stations.value = fresh.stations;
    orders.value = fresh.orders;
  }

  const blockedTrips = computed(() => new Set(conflicts.value.map((c) => c.tripNo)));

  const queuedByOrder = computed(() => {
    const map = new Map<string, PendingOp>();
    for (const op of queue.value) map.set(op.orderId, op);
    return map;
  });

  function stationById(id: string): Station | undefined {
    return stations.value.find((s) => s.id === id);
  }

  function stationName(id: string): string {
    return stationById(id)?.name ?? id;
  }

  /**
   * 有效车位占用 = 已确认占用 + 待同步占位的净移动。
   * 同一车次只有一辆车：改派是「移动」而不是复制，从已确认位置 -1、目标位置 +1，
   * 避免断网改派后两个站点同时占车位。冲突中的车次不计入（未处理前不能继续占用）。
   */
  function occupancy(stationId: string, slot: string, excludeOrderId?: string): number {
    let count = orders.value.filter(
      (o) => o.stationId === stationId && o.slot === slot && o.id !== excludeOrderId
    ).length;
    for (const op of queue.value) {
      if (op.orderId === excludeOrderId) continue;
      if (blockedTrips.value.has(op.tripNo)) continue;
      const base = orders.value.find((o) => o.id === op.orderId);
      if (!base) continue;
      if (base.stationId === stationId && base.slot === slot) count -= 1;
      const toStation = op.changes.stationId ?? base.stationId;
      const toSlot = op.changes.slot ?? base.slot;
      if (toStation === stationId && toSlot === slot) count += 1;
    }
    return count;
  }

  /** 从指定时段起逐小时扫描，返回目标站最早有剩余车位的时段 */
  function earliestSlot(stationId: string, fromSlot: string, excludeOrderId?: string): string | null {
    const station = stationById(stationId);
    if (!station) return null;
    for (let h = 0; h <= 72; h += 1) {
      const slot = addHours(fromSlot, h);
      if (occupancy(stationId, slot, excludeOrderId) < station.slotCapacity) return slot;
    }
    return null;
  }

  /**
   * 改派：先占用目标站车位（写入待同步队列即生效于占用统计）。
   * 容量不够时不入队、保留原派单，并返回最早可用时段。
   */
  function queueReassign(order: DispatchOrder, changes: OpChanges, note: string): ReassignResult {
    if (blockedTrips.value.has(order.tripNo)) {
      return { ok: false, reason: "该车次存在待处理冲突，未处理前不能继续占用" };
    }
    const existing = queuedByOrder.value.get(order.id);
    const baseline = existing?.baseline ?? {
      stationId: order.stationId,
      volume: order.volume,
      slot: order.slot
    };
    const targetStation = changes.stationId ?? order.stationId;
    const targetSlot = changes.slot ?? order.slot;
    const station = stationById(targetStation);
    if (!station) return { ok: false, reason: "目标站点不存在" };

    const diff = effectiveChanges(baseline, changes);
    if (Object.keys(diff).length === 0) {
      if (existing) {
        queue.value = queue.value.filter((op) => op.id !== existing.id);
        persistClient();
        say(`${order.tripNo} 的待同步改派已撤销（与已确认一致）`);
        return { ok: true };
      }
      return { ok: false, reason: "改派内容与已确认派单一致，无需占用" };
    }

    if (occupancy(targetStation, targetSlot, order.id) >= station.slotCapacity) {
      const earliest = earliestSlot(targetStation, targetSlot, order.id);
      return {
        ok: false,
        reason: `${station.name} ${targetSlot} 车位已满，已保留原派单`,
        earliest: earliest ?? undefined
      };
    }

    if (existing) {
      // 重复改派只生效一次：沿用同一幂等键与字段基线，仅更新变更内容
      existing.changes = diff;
      existing.note = note;
      existing.lastError = null;
    } else {
      queue.value.push({
        id: crypto.randomUUID(),
        kind: "reassign",
        orderId: order.id,
        tripNo: order.tripNo,
        baseline,
        changes: diff,
        note,
        createdAt: new Date().toISOString(),
        attempts: 0,
        lastError: null
      });
    }
    persistClient();
    return { ok: true };
  }

  /** 合并结果落账：移除已应用操作、登记冲突、拉取最新已确认结果 */
  function settle(result: { applied: string[]; conflicts: ConflictItem[] }) {
    const conflictIds = new Set(result.conflicts.map((c) => c.id));
    queue.value = queue.value.filter(
      (op) => !result.applied.includes(op.id) && !conflictIds.has(op.id)
    );
    for (const item of result.conflicts) {
      const idx = conflicts.value.findIndex((c) => c.id === item.id);
      if (idx >= 0) conflicts.value[idx] = item;
      else conflicts.value.push(item);
    }
    pullConfirmed();
    lastSyncAt.value = new Date().toISOString();
    persistClient();
  }

  /** 恢复联网后合并：按站点、车次和字段基线逐条合并 */
  function sync() {
    if (!online.value) {
      say("当前为断网模式：操作已保留在待同步队列，恢复联网后再合并");
      return;
    }
    if (queue.value.length === 0) {
      pullConfirmed();
      lastSyncAt.value = new Date().toISOString();
      say("已拉取最新已确认台账");
      return;
    }
    syncing.value = true;
    try {
      const result = applyOps(queue.value);
      if (!result.ok) {
        // 失败保留原操作，记录原因可重试
        for (const op of queue.value) {
          op.attempts += 1;
          op.lastError = result.error;
        }
        persistClient();
        say(`同步失败：${result.error}。原操作已保留，可重试`);
        return;
      }
      const appliedCount = result.applied.length;
      const conflictCount = result.conflicts.length;
      settle(result);
      say(
        conflictCount > 0
          ? `已合并 ${appliedCount} 条；${conflictCount} 条同一车次两边都改过，已保留两版待处理`
          : `同步完成：${appliedCount} 条改派已确认（已确认派单不可回退）`
      );
    } finally {
      syncing.value = false;
    }
  }

  /** 单条重试：失败后操作仍在队列中 */
  function retryOp(opId: string) {
    const op = queue.value.find((o) => o.id === opId);
    if (!op) return;
    if (!online.value) {
      say("断网中：操作保留在队列，恢复联网后重试");
      return;
    }
    const result = applyOps([op]);
    if (!result.ok) {
      op.attempts += 1;
      op.lastError = result.error;
      persistClient();
      say(`重试失败：${result.error}，操作已保留`);
      return;
    }
    settle(result);
    say(result.conflicts.length > 0 ? `${op.tripNo} 检测到冲突，已保留两版待处理` : `${op.tripNo} 改派已确认`);
  }

  /**
   * 处理冲突：
   * - 保留服务端：撤销本地改派，已确认派单不变；
   * - 保留本地：以服务端当前值重建字段基线重新入队并立即重试。
   */
  function resolveConflict(id: string, choice: "local" | "remote") {
    const conflict = conflicts.value.find((c) => c.id === id);
    if (!conflict) return;
    conflicts.value = conflicts.value.filter((c) => c.id !== id);
    if (choice === "remote") {
      persistClient();
      say(`已保留服务端版本：${conflict.tripNo} 的本地改派已撤销`);
      return;
    }
    const op: PendingOp = {
      ...conflict.local,
      baseline: {
        stationId: conflict.remote.stationId,
        volume: conflict.remote.volume,
        slot: conflict.remote.slot
      },
      lastError: null
    };
    queue.value.unshift(op);
    persistClient();
    retryOp(op.id);
  }

  /** 站点台账登记：主数据按站点维度即时写入已确认快照 */
  function upsertStation(input: Omit<Station, "id"> & { id?: string }) {
    const id = input.id || `st-${crypto.randomUUID().slice(0, 8)}`;
    const next: Station = { ...input, id };
    const idx = stations.value.findIndex((s) => s.id === id);
    if (idx >= 0) stations.value[idx] = next;
    else stations.value.push(next);
    pushStations(stations.value);
    say(`站点台账已登记：${next.name}`);
  }

  /** 演示用：模拟对端调度员直接改派同一车次（只改服务端），同步时按基线合并出冲突 */
  function simulateRemoteChange(orderId: string) {
    const order = orders.value.find((o) => o.id === orderId);
    if (!order) return;
    const other = stations.value.find((s) => s.id !== order.stationId);
    if (!other) return;
    const updated = remoteReassign(orderId, { stationId: other.id, slot: addHours(order.slot, 1) });
    if (updated) {
      say(`对端已将 ${order.tripNo} 改派至 ${other.name}（服务端版本），同步后按字段基线合并`);
    }
  }

  function setOnline(value: boolean) {
    online.value = value;
    if (value) {
      say("网络已恢复，开始合并待同步操作");
      sync();
    } else {
      say("已切换断网模式：改派将进入待同步队列，可续作");
    }
  }

  function setOutage(value: boolean) {
    outage.value = value;
    setServerOutage(value);
    say(value ? "已开启服务端故障模拟：同步将失败并保留原操作" : "服务端故障模拟已解除");
  }

  /** 站点汇总：地图、库存统计、台账列表共用同一份已确认结果 */
  const stationSummaries = computed(() => {
    const slot = nextHourSlot();
    return stations.value.map((s) => {
      const used = occupancy(s.id, slot);
      const incoming = orders.value
        .filter((o) => o.stationId === s.id)
        .reduce((sum, o) => sum + o.volume, 0);
      return {
        ...s,
        slot,
        used,
        free: Math.max(0, s.slotCapacity - used),
        incoming,
        lowStock: s.currentStock < s.safetyStock,
        underGuarantee: incoming < s.minGuaranteed
      };
    });
  });

  const metrics = computed(() => [
    stations.value.length,
    orders.value.length,
    queue.value.length,
    conflicts.value.length
  ]);

  return {
    stations,
    orders,
    queue,
    conflicts,
    online,
    outage,
    syncing,
    lastSyncAt,
    notice,
    blockedTrips,
    queuedByOrder,
    stationSummaries,
    metrics,
    stationById,
    stationName,
    occupancy,
    earliestSlot,
    queueReassign,
    sync,
    retryOp,
    resolveConflict,
    upsertStation,
    simulateRemoteChange,
    setOnline,
    setOutage,
    say
  };
});
