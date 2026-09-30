// 保供台账核心类型定义

// 油站：登记安全库存、可用车位、保底油量
export type Station = {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  safetyStock: number; // 安全库存（低于该值预警）
  parkingSpots: number; // 可用车位（每时段可停靠车次容量）
  guaranteedFuel: number; // 保底油量（保供红线）
  stock: number; // 当前库存
};

// 车次字段（可改派的字段集合，作为字段基线与合并的最小单元）
export type DispatchFields = {
  stationId: string; // 停靠油站
  slot: string; // 占用时段
  fuelAmount: number; // 油量
};

export type DispatchStatus = "confirmed" | "conflict";

// 派单（车次）
export type Dispatch = {
  id: string;
  trainNumber: string; // 车次
  stationId: string;
  slot: string;
  fuelAmount: number;
  status: DispatchStatus;
  // 冲突时保留的两版（本地改派版 / 服务端现行版）
  localVersion?: Partial<DispatchFields>;
  remoteVersion?: Partial<DispatchFields>;
  conflictFields?: string[];
  conflictReason?: string;
};

export type OpType = "reassign" | "create" | "update";

export type OpStatus =
  | "pending" // 待同步（断线期间产生）
  | "syncing" // 同步中
  | "confirmed" // 已确认（生效）
  | "failed" // 失败（可重试）
  | "conflict" // 冲突（两版待处理）
  | "duplicate"; // 重复改派（幂等命中，不再生效）

// 待同步操作
export type SyncOp = {
  id: string;
  idempotencyKey: string; // 幂等键：重复改派只生效一次
  type: OpType;
  trainNumber: string;
  payload: Partial<DispatchFields>; // 期望改派到的字段
  baseline: DispatchFields; // 字段基线：操作创建时的字段值
  baseVersion: number; // 基线版本号
  createdAt: string;
  status: OpStatus;
  error?: string;
  earliestSlot?: string; // 容量不足时给出的最早可用时段
  resultDispatchId?: string;
  conflictFields?: string[];
};

// 合并结果
export type MergeResult = {
  ok: boolean;
  conflict: boolean;
  duplicate?: boolean;
  reason?: string;
  conflictFields?: string[];
  earliestSlot?: string;
};
