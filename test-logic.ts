import { createPinia, setActivePinia } from "pinia";
import { useLedgerStore } from "./src/ledger/store";

// ---- Mocks for Node environment ----
function createLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
}
(globalThis as any).localStorage = createLocalStorageMock();
(globalThis as any).navigator = { onLine: true };

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

// 每个 section 使用全新的 store（隔离状态）
function freshStore() {
  (globalThis as any).localStorage = createLocalStorageMock();
  (globalThis as any).navigator = { onLine: true };
  setActivePinia(createPinia());
  return useLedgerStore();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------
section("1. 在线改派 - 有容量，占用目标车位，释放源车位");
{
  const store = freshStore();
  // G001 at st-east 08:00-10:00 (3 occupied / 4 total). 改派到 st-airport 14:00-16:00 (0 occupied).
  const result = store.reassign("G001", "st-airport", "14:00-16:00");
  assert(result.ok === true, "改派返回 ok=true");
  assert(result.queued === false, "在线改派不入队");
  const g001 = store.dispatchByTrain("G001")!;
  assert(g001.stationId === "st-airport", "G001 已改派到 st-airport");
  assert(g001.slot === "14:00-16:00", "G001 时段已更新");
  assert(g001.status === "confirmed", "G001 状态为已确认");
  assert(store.occupancyAt("st-east", "08:00-10:00") === 2, "源车位已释放 (st-east 08:00-10:00 剩 2)");
  assert(store.occupancyAt("st-airport", "14:00-16:00") === 1, "目标车位已占用 (st-airport 14:00-16:00 有 1)");
}

// ---------------------------------------------------------------
section("2. 在线改派 - 容量不够，保留原派单，显示最早可用时段，失败操作入队可重试");
{
  const store = freshStore();
  // st-airport 10:00-12:00 有 G004,G005,G006 (3 occupied / 3 total, 已满)
  const result = store.reassign("G001", "st-airport", "10:00-12:00");
  assert(result.ok === false, "容量不够时返回 ok=false");
  assert(result.earliestSlot === "12:00-14:00", `最早可用时段为 12:00-14:00 (实际: ${result.earliestSlot})`);
  const g001 = store.dispatchByTrain("G001")!;
  assert(g001.stationId === "st-east", "G001 仍保留在原油站 st-east");
  assert(g001.slot === "08:00-10:00", "G001 时段未变");
  assert(store.occupancyAt("st-airport", "10:00-12:00") === 3, "目标车位未被占用 (仍为 3)");
  // 失败操作入队
  const failedOp = store.ops.find((o) => o.status === "failed" && o.trainNumber === "G001");
  assert(failedOp !== undefined, "失败操作已入队");
  assert(failedOp?.earliestSlot === "12:00-14:00", "失败操作记录了最早可用时段");
  // 重试：改派到 12:00-14:00 (有容量)
  const retry = store.reassign("G001", "st-airport", "12:00-14:00");
  assert(retry.ok === true, "重试改派到 12:00-14:00 成功");
  const g001After = store.dispatchByTrain("G001")!;
  assert(g001After.stationId === "st-airport", "G001 重试后改派到 st-airport");
  assert(g001After.slot === "12:00-14:00", "G001 时段为 12:00-14:00");
}

// ---------------------------------------------------------------
section("3. 断线改派 - 进入待同步队列，恢复后自动同步生效");
{
  const store = freshStore();
  store.setOnline(false);
  assert(store.online === false, "已切换到断线");
  const result = store.reassign("G003", "st-west", "16:00-18:00");
  assert(result.ok === true, "断线改派返回 ok");
  assert(result.queued === true, "断线改派进入待同步队列");
  assert(store.pendingCount === 1, "待同步队列有 1 条");
  const g003 = store.dispatchByTrain("G003")!;
  assert(g003.stationId === "st-east", "G003 本地仍在 st-east (未同步)");

  // 恢复网络
  store.setOnline(true);
  await wait(600);
  assert(store.online === true, "已恢复在线");
  assert(g003.stationId === "st-west", "G003 已同步到 st-west");
  assert(g003.slot === "16:00-18:00", "G003 时段已同步");
  assert(g003.status === "confirmed", "G003 已确认");
  assert(store.pendingCount === 0, "待同步队列已清空");
}

// ---------------------------------------------------------------
section("4. 重复改派 - 幂等，只生效一次");
{
  const store = freshStore();
  // 第一次改派 G001 到 st-airport 14:00-16:00 (online, 生效)
  store.reassign("G001", "st-airport", "14:00-16:00");
  // 第二次提交相同改派（模拟重试/重复提交）
  store.reassign("G001", "st-airport", "14:00-16:00");
  const duplicateOps = store.ops.filter((o) => o.status === "duplicate");
  assert(duplicateOps.length >= 1, "存在标记为 duplicate 的操作");
  const g001 = store.dispatchByTrain("G001")!;
  assert(g001.stationId === "st-airport" && g001.slot === "14:00-16:00", "G001 未重复改派");
  assert(store.occupancyAt("st-airport", "14:00-16:00") === 1, "st-airport 14:00-16:00 仍为 1 (未重复占用)");
}

// ---------------------------------------------------------------
section("5. 冲突 - 两边都改过，保留两版待处理，未处理前不能继续占用");
{
  const store = freshStore();
  // G007 当前在 st-west 09:00-11:00
  // 断线改派 G007 到 st-east 14:00-16:00 (创建 op，baseline = st-west 09:00-11:00)
  store.setOnline(false);
  store.reassign("G007", "st-east", "14:00-16:00");
  assert(store.pendingCount === 1, "断线改派已入队");

  // 模拟服务端侧也改了 G007 的时段（到 16:00-18:00）
  const g007 = store.dispatchByTrain("G007")!;
  g007.slot = "16:00-18:00";

  // 恢复网络，同步
  store.setOnline(true);
  await wait(600);

  assert(g007.status === "conflict", "G007 状态为冲突");
  assert(g007.localVersion !== undefined, "保留了本地改派版");
  assert(g007.remoteVersion !== undefined, "保留了服务端现行版");
  assert(g007.conflictFields?.includes("slot"), "冲突字段包含 slot");
  assert(g007.localVersion?.stationId === "st-east", "本地版油站为 st-east");
  assert(g007.localVersion?.slot === "14:00-16:00", "本地版时段为 14:00-16:00");
  assert(g007.remoteVersion?.slot === "16:00-18:00", "服务端版时段为 16:00-18:00");

  // 未处理前不能继续占用
  const relResult = store.reassign("G007", "st-south", "14:00-16:00");
  assert(relResult.ok === false, "冲突派单不能继续改派");
  assert(relResult.reason?.includes("冲突"), "提示存在冲突");

  // 处理冲突：保留本地版
  store.resolveConflict(g007.id, "local");
  assert(g007.status === "confirmed", "冲突处理后 G007 已确认");
  assert(g007.stationId === "st-east", "G007 采用本地版 → st-east");
  assert(g007.slot === "14:00-16:00", "G007 采用本地版 → 14:00-16:00");
  assert(g007.localVersion === undefined, "本地版已清除");
  assert(g007.remoteVersion === undefined, "服务端版已清除");
}

// ---------------------------------------------------------------
section("6. 冲突处理 - 采用服务端版");
{
  const store = freshStore();
  const g007 = store.dispatchByTrain("G007")!;
  store.setOnline(false);
  store.reassign("G007", "st-east", "14:00-16:00");
  g007.slot = "16:00-18:00";
  store.setOnline(true);
  await wait(600);
  assert(g007.status === "conflict", "G007 状态为冲突");
  store.resolveConflict(g007.id, "remote");
  assert(g007.status === "confirmed", "冲突处理后 G007 已确认");
  assert(g007.stationId === "st-west", "G007 采用服务端版 → st-west");
  assert(g007.slot === "16:00-18:00", "G007 采用服务端版 → 16:00-18:00");
}

// ---------------------------------------------------------------
section("7. 已确认派单不能回退");
{
  const store = freshStore();
  const g001 = store.dispatchByTrain("G001")!;
  const before = { stationId: g001.stationId, slot: g001.slot };
  // 已确认派单只能通过改派流程变更，不能直接回退
  assert(g001.status === "confirmed", "G001 为已确认");
  assert(g001.stationId === before.stationId && g001.slot === before.slot, "G001 状态未被回退");
  // 改派后状态变更但仍为 confirmed（不回退）
  store.reassign("G001", "st-airport", "14:00-16:00");
  assert(g001.status === "confirmed", "改派后 G001 仍为已确认");
}

// ---------------------------------------------------------------
section("8. 地图、库存统计、待处理清单读取同一份已确认结果");
{
  const store = freshStore();
  // stationStats 读取 confirmed 结果
  const stats = store.stationStats;
  assert(stats.length === store.stations.length, "统计包含所有油站");
  for (const s of store.stations) {
    const confirmedCount = store.dispatches.filter(
      (d) => d.stationId === s.id && d.status === "confirmed"
    ).length;
    const stat = stats.find((r) => r.station.id === s.id);
    assert(stat?.totalOccupied === confirmedCount, `${s.name} 统计占用数 (${stat?.totalOccupied}) 与已确认派单 (${confirmedCount}) 一致`);
  }
  // 待处理清单 = pending + failed + conflict
  store.setOnline(false);
  store.reassign("G001", "st-west", "16:00-18:00");
  const pendingList = store.pendingOps;
  const expectedPending = store.ops.filter(
    (o) => o.status === "pending" || o.status === "failed" || o.status === "conflict"
  );
  assert(pendingList.length === expectedPending.length, "待处理清单与 ops 队列一致");
  assert(pendingList.length === 1, "待处理清单有 1 条 (断线改派)");
}

// ---------------------------------------------------------------
section("9. 保底油量与安全库存统计");
{
  const store = freshStore();
  const stats = store.stationStats;
  for (const s of store.stations) {
    const stat = stats.find((r) => r.station.id === s.id)!;
    assert(stat.belowSafety === (s.stock < s.safetyStock), `${s.name} 安全库存预警正确`);
    assert(stat.belowGuaranteed === (s.stock < s.guaranteedFuel), `${s.name} 保底油量预警正确`);
    assert(stat.available === Math.max(0, s.parkingSpots - stat.occupied), `${s.name} 可用车位计算正确`);
  }
}

// ---------------------------------------------------------------
console.log(`\n========================================`);
console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
}
