import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { SEED_DISPATCHES, SEED_STATIONS, SLOTS } from "./seed";
import type {
  Dispatch,
  DispatchFields,
  MergeResult,
  Station,
  SyncOp,
} from "./types";

const STORAGE_KEY = "hxwlfront-21-supply-ledger";

// 从 localStorage 恢复，否则用种子数据
function loadState(): {
  stations: Station[];
  dispatches: Dispatch[];
  ops: SyncOp[];
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        stations: parsed.stations ?? SEED_STATIONS,
        dispatches: parsed.dispatches ?? SEED_DISPATCHES,
        ops: parsed.ops ?? [],
      };
    }
  } catch {
    // 损坏则回退到种子
  }
  return {
    stations: SEED_STATIONS.map((s) => ({ ...s })),
    dispatches: SEED_DISPATCHES.map((d) => ({ ...d })),
    ops: [],
  };
}

function fieldsOf(d: Dispatch): DispatchFields {
  return { stationId: d.stationId, slot: d.slot, fuelAmount: d.fuelAmount };
}

// 生成幂等键：同一车次改派到同一油站同一时段，重复提交只生效一次
function idempotencyKeyOf(trainNumber: string, payload: Partial<DispatchFields>): string {
  return `reassign:${trainNumber}:${payload.stationId ?? ""}:${payload.slot ?? ""}`;
}

export const useLedgerStore = defineStore("ledger", () => {
  const initial = loadState();
  const stations = ref<Station[]>(initial.stations);
  const dispatches = ref<Dispatch[]>(initial.dispatches);
  const ops = ref<SyncOp[]>(initial.ops);
  const online = ref<boolean>(navigator.onLine);
  const syncing = ref<boolean>(false);

  // ---- 持久化 ----
  function persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        stations: stations.value,
        dispatches: dispatches.value,
        ops: ops.value,
      })
    );
  }

  // ---- 在线状态 ----
  function setOnline(value: boolean) {
    online.value = value;
    if (value) {
      // 恢复网络后自动同步
      void syncAll();
    }
  }

  // ---- 车位占用计算 ----
  // 已确认派单占用车位；冲突派单冻结在当前油站（仍占用但不可改派）
  function occupancyAt(stationId: string, slot: string, excludeDispatchId?: string): number {
    return dispatches.value.filter(
      (d) =>
        d.stationId === stationId &&
        d.slot === slot &&
        d.id !== excludeDispatchId &&
        (d.status === "confirmed" || d.status === "conflict")
    ).length;
  }

  function stationById(id: string): Station | undefined {
    return stations.value.find((s) => s.id === id);
  }

  function hasCapacity(stationId: string, slot: string, excludeDispatchId?: string): boolean {
    const station = stationById(stationId);
    if (!station) return false;
    return occupancyAt(stationId, slot, excludeDispatchId) < station.parkingSpots;
  }

  // 最早可用时段：从 fromSlot 起向后找第一个有空位的时段
  function earliestAvailableSlot(stationId: string, fromSlot: string, excludeDispatchId?: string): string | null {
    const fromIdx = SLOTS.indexOf(fromSlot as (typeof SLOTS)[number]);
    const start = fromIdx < 0 ? 0 : fromIdx;
    for (let i = start; i < SLOTS.length; i++) {
      if (hasCapacity(stationId, SLOTS[i], excludeDispatchId)) {
        return SLOTS[i];
      }
    }
    return null;
  }

  // ---- 派单查询 ----
  function dispatchByTrain(trainNumber: string): Dispatch | undefined {
    return dispatches.value.find((d) => d.trainNumber === trainNumber);
  }

  const confirmedDispatches = computed(() =>
    dispatches.value.filter((d) => d.status === "confirmed")
  );
  const conflictDispatches = computed(() =>
    dispatches.value.filter((d) => d.status === "conflict")
  );

  // 待同步队列：待同步 + 失败 + 冲突（冲突需人工处理）
  const pendingOps = computed(() =>
    ops.value.filter((o) => o.status === "pending" || o.status === "failed" || o.status === "conflict")
  );
  const pendingCount = computed(() => pendingOps.value.length);

  // ---- 改派（核心） ----
  // 断线时进入待同步队列；在线时立即走合并流程。
  // 容量不够：保留原派单，返回最早可用时段。
  function reassign(
    trainNumber: string,
    targetStationId: string,
    slot: string
  ): { ok: boolean; queued: boolean; reason?: string; earliestSlot?: string } {
    const dispatch = dispatchByTrain(trainNumber);
    if (!dispatch) {
      return { ok: false, queued: false, reason: "未找到该车次派单" };
    }
    // 冲突派单未处理前不能继续占用
    if (dispatch.status === "conflict") {
      return { ok: false, queued: false, reason: "该车次存在未处理冲突，暂不能改派" };
    }

    const payload: Partial<DispatchFields> = { stationId: targetStationId, slot };
    const baseline = fieldsOf(dispatch);

    // 容量校验：先占用目标站车位，容量不够则保留原派单
    if (!hasCapacity(targetStationId, slot, dispatch.id)) {
      const earliest = earliestAvailableSlot(targetStationId, slot, dispatch.id);
      // 容量不够：保留原派单并记录失败操作（可重试）；断线时入待同步队列
      const op = enqueueOp("reassign", trainNumber, payload, baseline);
      if (online.value) {
        op.status = "failed";
        op.error = "目标站车位已满，保留原派单";
      }
      op.earliestSlot = earliest ?? undefined;
      persist();
      return {
        ok: false,
        queued: !online.value,
        reason: online.value ? "目标站车位已满，保留原派单" : "目标站车位已满，已进入待同步队列",
        earliestSlot: earliest ?? undefined,
      };
    }

    const op = enqueueOp("reassign", trainNumber, payload, baseline);
    if (online.value) {
      const result = processOp(op);
      persist();
      return {
        ok: result.ok,
        queued: false,
        reason: result.reason,
        earliestSlot: result.earliestSlot,
      };
    }
    persist();
    return { ok: true, queued: true };
  }

  function enqueueOp(
    type: SyncOp["type"],
    trainNumber: string,
    payload: Partial<DispatchFields>,
    baseline: DispatchFields
  ): SyncOp {
    const op: SyncOp = {
      id: crypto.randomUUID(),
      idempotencyKey: idempotencyKeyOf(trainNumber, payload),
      type,
      trainNumber,
      payload,
      baseline: { ...baseline },
      baseVersion: 1,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    ops.value.unshift(op);
    return op;
  }

  // ---- 处理单个待同步操作（3-way 字段基线合并） ----
  function processOp(op: SyncOp): MergeResult {
    // 幂等：同一幂等键已确认过，重复改派只生效一次
    const alreadyConfirmed = ops.value.some(
      (o) => o.id !== op.id && o.idempotencyKey === op.idempotencyKey && o.status === "confirmed"
    );
    if (alreadyConfirmed) {
      op.status = "duplicate";
      return { ok: true, conflict: false, duplicate: true };
    }

    const dispatch = dispatchByTrain(op.trainNumber);
    if (!dispatch) {
      op.status = "failed";
      op.error = "未找到该车次派单";
      return { ok: false, conflict: false, reason: op.error };
    }

    // 冲突派单锁定中，不能继续占用
    if (dispatch.status === "conflict") {
      op.status = "failed";
      op.error = "该车次存在未处理冲突，暂不能改派";
      return { ok: false, conflict: false, reason: op.error };
    }

    const current = fieldsOf(dispatch);
    const baseline = op.baseline;
    const payload = op.payload;

    // 3-way 合并：对每个被改派的字段，判断本地与服务端是否都改了
    const conflictFields: string[] = [];
    const merged: Partial<DispatchFields> = {};
    const mergedRec = merged as Record<string, string | number | undefined>;
    for (const key of Object.keys(payload) as (keyof DispatchFields)[]) {
      const localVal = payload[key];
      const baseVal = baseline[key];
      const remoteVal = current[key];
      const localChanged = localVal !== baseVal;
      const remoteChanged = remoteVal !== baseVal;
      if (localChanged && remoteChanged && localVal !== remoteVal) {
        // 两边都改了且不一致 → 冲突
        conflictFields.push(key);
      } else if (localChanged) {
        mergedRec[key] = localVal;
      } else {
        mergedRec[key] = remoteVal;
      }
    }

    if (conflictFields.length > 0) {
      // 保留两版待处理：本地改派版 / 服务端现行版
      dispatch.status = "conflict";
      dispatch.localVersion = { ...payload };
      dispatch.remoteVersion = { ...current };
      dispatch.conflictFields = conflictFields;
      dispatch.conflictReason = `车次 ${op.trainNumber} 的 ${conflictFields.join("、")} 字段两边都有修改`;
      op.status = "conflict";
      op.conflictFields = conflictFields;
      return { ok: false, conflict: true, duplicate: false, conflictFields };
    }

    // 合并后需要落定的字段值
    const next: DispatchFields = {
      stationId: merged.stationId ?? current.stationId,
      slot: merged.slot ?? current.slot,
      fuelAmount: merged.fuelAmount ?? current.fuelAmount,
    };

    // 改派涉及油站或时段变化 → 重新校验目标站容量（先占用目标站车位）
    const stationChanged = next.stationId !== current.stationId;
    const slotChanged = next.slot !== current.slot;
    if (stationChanged || slotChanged) {
      if (!hasCapacity(next.stationId, next.slot, dispatch.id)) {
        const earliest = earliestAvailableSlot(next.stationId, next.slot, dispatch.id);
        op.status = "failed";
        op.error = "目标站车位已满，保留原派单";
        op.earliestSlot = earliest ?? undefined;
        return {
          ok: false,
          conflict: false,
          reason: op.error,
          earliestSlot: earliest ?? undefined,
        };
      }
    }

    // 原子生效：释放源车位、占用目标车位（已确认派单不能回退）
    dispatch.stationId = next.stationId;
    dispatch.slot = next.slot;
    dispatch.fuelAmount = next.fuelAmount;
    dispatch.status = "confirmed";
    op.status = "confirmed";
    op.resultDispatchId = dispatch.id;
    return { ok: true, conflict: false, duplicate: false };
  }

  // ---- 同步所有待同步操作 ----
  async function syncAll() {
    if (syncing.value) return;
    syncing.value = true;
    const pending = ops.value.filter(
      (o) => o.status === "pending" || o.status === "failed"
    );
    for (const op of pending) {
      op.status = "syncing";
      // 模拟网络往返
      await new Promise((r) => setTimeout(r, 250));
      processOp(op);
    }
    syncing.value = false;
    persist();
  }

  // ---- 重试单个失败操作 ----
  async function retryOp(opId: string) {
    const op = ops.value.find((o) => o.id === opId);
    if (!op) return;
    if (!online.value) {
      op.error = "当前离线，无法重试";
      return;
    }
    op.status = "syncing";
    await new Promise((r) => setTimeout(r, 250));
    processOp(op);
    persist();
  }

  // ---- 冲突处理：选择本地版或服务端版 ----
  function resolveConflict(dispatchId: string, choice: "local" | "remote") {
    const dispatch = dispatches.value.find((d) => d.id === dispatchId);
    if (!dispatch || dispatch.status !== "conflict") return;
    const version = choice === "local" ? dispatch.localVersion : dispatch.remoteVersion;
    if (version) {
      if (version.stationId) dispatch.stationId = version.stationId;
      if (version.slot) dispatch.slot = version.slot;
      if (version.fuelAmount !== undefined) dispatch.fuelAmount = version.fuelAmount;
    }
    dispatch.status = "confirmed";
    dispatch.localVersion = undefined;
    dispatch.remoteVersion = undefined;
    dispatch.conflictFields = undefined;
    dispatch.conflictReason = undefined;
    // 相关冲突操作标记为已确认
    ops.value
      .filter((o) => o.status === "conflict" && o.trainNumber === dispatch.trainNumber)
      .forEach((o) => {
        o.status = "confirmed";
        o.resultDispatchId = dispatch.id;
      });
    persist();
  }

  // ---- 库存统计（读取同一份已确认结果） ----
  const stationStats = computed(() =>
    stations.value.map((s) => {
      const occupied = occupancyAt(s.id, "08:00-10:00"); // 统计口径：早高峰占用
      const totalOccupied = dispatches.value.filter(
        (d) => d.stationId === s.id && d.status === "confirmed"
      ).length;
      const belowSafety = s.stock < s.safetyStock;
      const belowGuaranteed = s.stock < s.guaranteedFuel;
      return {
        station: s,
        occupied,
        totalOccupied,
        available: Math.max(0, s.parkingSpots - occupied),
        belowSafety,
        belowGuaranteed,
      };
    })
  );

  return {
    // state
    stations,
    dispatches,
    ops,
    online,
    syncing,
    // getters
    confirmedDispatches,
    conflictDispatches,
    pendingOps,
    pendingCount,
    stationStats,
    // actions
    setOnline,
    reassign,
    syncAll,
    retryOp,
    resolveConflict,
    occupancyAt,
    hasCapacity,
    earliestAvailableSlot,
    stationById,
    dispatchByTrain,
    persist,
  };
});
