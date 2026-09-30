/** 站点台账：每站登记安全库存、可用车位与保底油量 */
export interface Station {
  id: string;
  name: string;
  area: string;
  lng: number;
  lat: number;
  /** 安全库存 L，低于该值视为库存紧张 */
  safetyStock: number;
  /** 当前库存 L */
  currentStock: number;
  /** 保底油量 L：保供要求确认到站的油量下限 */
  minGuaranteed: number;
  /** 每个时段可停靠的罐车车位数 */
  slotCapacity: number;
}

/** 已确认派单：确认后不可回退，只能通过新的改派操作向前变更 */
export interface DispatchOrder {
  id: string;
  /** 车次 */
  tripNo: string;
  /** 罐车 */
  vehicle: string;
  stationId: string;
  /** 配送油量 L */
  volume: number;
  /** 到站时段，格式 YYYY-MM-DD HH:00 */
  slot: string;
  /** 服务端版本号 */
  revision: number;
  /** 已应用的改派幂等键，重复改派只生效一次 */
  appliedOps: string[];
  updatedAt: string;
}

/** 改派可变更的字段 */
export interface OpChanges {
  stationId?: string;
  volume?: number;
  slot?: string;
}

/** 待同步操作：断网时的本地改派，带字段基线，恢复后按基线合并 */
export interface PendingOp {
  /** 幂等键：同一操作重试/重复提交只生效一次 */
  id: string;
  kind: "reassign";
  orderId: string;
  tripNo: string;
  /** 字段基线：发起改派时的已确认值 */
  baseline: { stationId: string; volume: number; slot: string };
  /** 字段级变更（只记录与基线不同的字段） */
  changes: OpChanges;
  note: string;
  createdAt: string;
  /** 同步尝试次数，失败后保留原操作可重试 */
  attempts: number;
  lastError: string | null;
}

/** 合并冲突：同一车次两边都改过，保留两版待处理 */
export interface ConflictItem {
  /** 与本地操作同 id，便于去重 */
  id: string;
  orderId: string;
  tripNo: string;
  /** 本地版本 */
  local: PendingOp;
  /** 服务端版本（检测到冲突时的快照） */
  remote: DispatchOrder;
  detectedAt: string;
}

/** 服务端（已确认）快照：地图、库存统计、待处理清单共同读取的真源 */
export interface ServerSnapshot {
  stations: Station[];
  orders: DispatchOrder[];
}

export type SyncResult =
  | { ok: true; applied: string[]; conflicts: ConflictItem[] }
  | { ok: false; error: string };
