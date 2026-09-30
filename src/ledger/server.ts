import type {
  ConflictItem,
  DispatchOrder,
  OpChanges,
  PendingOp,
  ServerSnapshot,
  Station,
  SyncResult
} from "./types";
import { addHours, nextHourSlot } from "./slots";

/**
 * 模拟服务端：已确认台账的唯一真源。
 * 用独立的 localStorage 命名空间模拟远端，断网时本地操作进入待同步队列，
 * 恢复后按「站点 + 车次 + 字段基线」合并，替代原来的整条记录覆盖。
 */
const SERVER_KEY = "hxwlfront-21-ledger-server";

/** 模拟服务端故障开关：开启后 applyOps 失败，用于验证「失败保留原操作可重试」 */
let outage = false;
export function setServerOutage(value: boolean) {
  outage = value;
}

function seed(): ServerSnapshot {
  const base = nextHourSlot();
  return {
    stations: [
      { id: "st-east", name: "东区一站", area: "东区", lng: 116.48, lat: 39.95, safetyStock: 15000, currentStock: 36000, minGuaranteed: 20000, slotCapacity: 2 },
      { id: "st-west", name: "西区中心站", area: "西区", lng: 116.28, lat: 39.92, safetyStock: 12000, currentStock: 18000, minGuaranteed: 15000, slotCapacity: 1 },
      { id: "st-airport", name: "机场快线站", area: "机场线", lng: 116.6, lat: 40.05, safetyStock: 10000, currentStock: 9000, minGuaranteed: 12000, slotCapacity: 1 }
    ],
    orders: [
      { id: "od-1001", tripNo: "C0930-01", vehicle: "京A·D1234 罐车", stationId: "st-east", volume: 20000, slot: base, revision: 1, appliedOps: [], updatedAt: new Date().toISOString() },
      { id: "od-1002", tripNo: "C0930-02", vehicle: "京B·D5678 罐车", stationId: "st-west", volume: 15000, slot: addHours(base, 1), revision: 1, appliedOps: [], updatedAt: new Date().toISOString() },
      { id: "od-1003", tripNo: "C0930-03", vehicle: "京A·D9999 罐车", stationId: "st-airport", volume: 12000, slot: addHours(base, 2), revision: 1, appliedOps: [], updatedAt: new Date().toISOString() }
    ]
  };
}

export function loadServer(): ServerSnapshot {
  const raw = localStorage.getItem(SERVER_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as ServerSnapshot;
    } catch {
      // 数据损坏时重新播种，保证可续作
    }
  }
  const fresh = seed();
  saveServer(fresh);
  return fresh;
}

export function saveServer(snapshot: ServerSnapshot) {
  localStorage.setItem(SERVER_KEY, JSON.stringify(snapshot));
}

/** 站点台账登记即时写入已确认快照（主数据按站点维度更新，不触碰派单） */
export function pushStations(stations: Station[]) {
  const server = loadServer();
  server.stations = structuredClone(stations);
  saveServer(server);
}

/**
 * 合并待同步操作：按车次定位派单，逐字段比对基线。
 * - 幂等：同一操作 id 已应用过则直接跳过，重复改派只生效一次；
 * - 基线一致：应用字段级变更；
 * - 基线不一致（同一车次两边都改过）：不应用任何变更，返回冲突，两版都保留待处理。
 */
export function applyOps(ops: PendingOp[]): SyncResult {
  if (outage) return { ok: false, error: "服务端不可达（模拟故障未解除）" };
  const server = loadServer();
  const applied: string[] = [];
  const conflicts: ConflictItem[] = [];

  for (const op of ops) {
    const order = server.orders.find((o) => o.id === op.orderId);
    if (!order) return { ok: false, error: `派单 ${op.tripNo} 在服务端不存在` };

    if (order.appliedOps.includes(op.id)) {
      applied.push(op.id);
      continue;
    }

    const mismatched: string[] = [];
    if (op.changes.stationId !== undefined && order.stationId !== op.baseline.stationId) mismatched.push("stationId");
    if (op.changes.volume !== undefined && order.volume !== op.baseline.volume) mismatched.push("volume");
    if (op.changes.slot !== undefined && order.slot !== op.baseline.slot) mismatched.push("slot");

    if (mismatched.length > 0) {
      conflicts.push({
        id: op.id,
        orderId: op.orderId,
        tripNo: op.tripNo,
        local: op,
        remote: structuredClone(order),
        detectedAt: new Date().toISOString()
      });
      continue;
    }

    if (op.changes.stationId !== undefined) order.stationId = op.changes.stationId;
    if (op.changes.volume !== undefined) order.volume = op.changes.volume;
    if (op.changes.slot !== undefined) order.slot = op.changes.slot;
    order.appliedOps.push(op.id);
    order.revision += 1;
    order.updatedAt = new Date().toISOString();
    applied.push(op.id);
  }

  saveServer(server);
  return { ok: true, applied, conflicts };
}

/** 模拟对端调度员直接改派（只改服务端），用于演示同一车次两边都改过时的冲突合并 */
export function remoteReassign(orderId: string, changes: OpChanges): DispatchOrder | null {
  const server = loadServer();
  const order = server.orders.find((o) => o.id === orderId);
  if (!order) return null;
  if (changes.stationId !== undefined) order.stationId = changes.stationId;
  if (changes.volume !== undefined) order.volume = changes.volume;
  if (changes.slot !== undefined) order.slot = changes.slot;
  order.revision += 1;
  order.updatedAt = new Date().toISOString();
  saveServer(server);
  return structuredClone(order);
}
