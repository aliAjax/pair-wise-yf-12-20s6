/**
 * 台账核心逻辑端到端验证（Node 环境，shim localStorage/window）。
 * 运行：npx esbuild test/ledger.e2e.ts --bundle --platform=node --format=esm --outfile=/tmp/ledger-e2e.mjs && node /tmp/ledger-e2e.mjs
 */

const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear()
};
(globalThis as Record<string, unknown>).window = {
  setTimeout: () => 0,
  clearTimeout: () => undefined
};

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  PASS ${msg}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${msg}`);
  }
}

async function main() {
  const { createPinia, setActivePinia } = await import("pinia");
  const { useLedgerStore } = await import("../src/ledger/store");
  const server = await import("../src/ledger/server");
  const { addHours, nextHourSlot } = await import("../src/ledger/slots");
  const types = await import("../src/ledger/types");

  function freshStore() {
    mem.clear();
    server.setServerOutage(false);
    setActivePinia(createPinia());
    return useLedgerStore();
  }

  console.log("== 场景1：改派先占用目标站车位，占用随车次移动 ==");
  {
    const store = freshStore();
    const base = store.orders[2].slot; // od-1003 的时段 = base+2
    const r1 = store.queueReassign(store.orders[2], { stationId: "st-east", volume: 12000, slot: base }, "");
    assert(r1.ok, "od-1003 改派东区一站成功入队");
    assert(store.queue.length === 1, "队列有 1 条待同步");
    assert(store.occupancy("st-east", base) === 1, "目标站车位被待同步占用 +1");
    assert(store.occupancy("st-airport", base) === 0, "原站车位同步释放（移动而非复制）");

    const r2 = store.queueReassign(store.orders[1], { stationId: "st-east", volume: 15000, slot: base }, "");
    assert(r2.ok, "od-1002 改派东区一站成功（容量2）");
    assert(store.occupancy("st-east", base) === 2, "目标站占用达到容量上限");

    const r3 = store.queueReassign(store.orders[0], { stationId: "st-east", volume: 20000, slot: base }, "");
    assert(!r3.ok && !("ok" in r3 && r3.ok), "第三车改派被容量拦截");
    if (!r3.ok) {
      assert(r3.reason.includes("车位已满") && r3.reason.includes("保留原派单"), "保留原派单并提示原因");
      assert(r3.earliest === addHours(base, 1), `最早可用时段为下一时段 (${r3.earliest})`);
    }
    assert(store.queue.length === 2, "容量不够不入队，队列仍为 2 条");
    assert(store.orders[0].stationId === "st-east" && store.orders[0].slot !== base, "原派单保持不变");

    // 重复改派同一车次：只生效一次（同一幂等键，更新而非新增）
    const opId = store.queue[0].id;
    const r4 = store.queueReassign(store.orders[2], { stationId: "st-west", volume: 12000, slot: base }, "改主意");
    assert(r4.ok && store.queue.length === 2, "重复改派不新增队列项");
    assert(store.queue[0].id === opId, "沿用同一幂等键");
    assert(store.occupancy("st-east", base) === 1, "旧目标占位随之释放");
    assert(store.occupancy("st-west", base) === 1, "新目标占位生效");
  }

  console.log("== 场景2：合并后已确认结果唯一，地图/统计同源 ==");
  {
    const store = freshStore();
    const slot = store.orders[2].slot;
    store.queueReassign(store.orders[2], { stationId: "st-east", volume: 12000, slot }, "");
    store.queueReassign(store.orders[1], { stationId: "st-east", volume: 15000, slot }, "");
    store.sync();
    assert(store.queue.length === 0, "合并后队列清空");
    assert(store.orders.find((o) => o.id === "od-1003")?.stationId === "st-east", "od-1003 已确认到东区一站");
    assert(store.orders.find((o) => o.id === "od-1002")?.stationId === "st-east", "od-1002 已确认到东区一站");
    const summary = store.stationSummaries.find((s) => s.id === "st-east");
    assert(summary?.incoming === 47000, "库存统计读取同一份已确认结果（在途 47000L）");
  }

  console.log("== 场景3：幂等 —— 同一操作重复提交只生效一次 ==");
  {
    mem.clear();
    server.setServerOutage(false);
    const snap = server.loadServer();
    const order = snap.orders[0];
    const op: import("../src/ledger/types").PendingOp = {
      id: "op-idem-1",
      kind: "reassign",
      orderId: order.id,
      tripNo: order.tripNo,
      baseline: { stationId: order.stationId, volume: order.volume, slot: order.slot },
      changes: { volume: 26000 },
      note: "",
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError: null
    };
    const r1 = server.applyOps([op]);
    const r2 = server.applyOps([op]);
    assert(r1.ok && r2.ok, "两次提交都返回成功");
    const after = server.loadServer().orders.find((o) => o.id === order.id);
    assert(after?.volume === 26000 && after.revision === 2, "版本只前进一次（revision=2）");
    assert(after?.appliedOps.filter((id) => id === "op-idem-1").length === 1, "幂等键只记录一次");
  }

  console.log("== 场景4：同一车次两边都改过 —— 保留两版，未处理前不能继续占用 ==");
  {
    const store = freshStore();
    const order = store.orders[0]; // od-1001 @ st-east
    const slot = order.slot;
    store.queueReassign(order, { stationId: "st-airport", volume: 20000, slot }, "本地改派");
    store.simulateRemoteChange(order.id); // 对端改到 st-west, slot+1
    store.sync();
    assert(store.conflicts.length === 1, "产生 1 条冲突，两版待处理");
    assert(store.queue.length === 0, "冲突操作移出待同步队列");
    assert(store.blockedTrips.has(order.tripNo), "车次被锁定");
    const blocked = store.queueReassign(order, { stationId: "st-west", volume: 20000, slot }, "");
    assert(!blocked.ok, "未处理前不能继续占用（改派被拒绝）");
    const confirmed = store.orders.find((o) => o.id === order.id);
    assert(confirmed?.stationId === "st-west", "本地改派不覆盖服务端版本（确认为对端的 st-west）");
    assert(store.occupancy("st-airport", slot) === 0, "冲突操作不占目标站车位");

    // 保留本地：按服务端当前值重建基线后重试生效
    store.resolveConflict(store.conflicts[0].id, "local");
    assert(store.conflicts.length === 0, "冲突已处理");
    const after = store.orders.find((o) => o.id === order.id);
    assert(after?.stationId === "st-airport", "保留本地后改派生效");
  }

  console.log("== 场景5：冲突保留服务端 ==");
  {
    const store = freshStore();
    const order = store.orders[1]; // od-1002 @ st-west
    store.queueReassign(order, { stationId: "st-east", volume: 15000, slot: order.slot }, "本地改派");
    store.simulateRemoteChange(order.id);
    store.sync();
    assert(store.conflicts.length === 1, "冲突出现");
    store.resolveConflict(store.conflicts[0].id, "remote");
    assert(store.conflicts.length === 0 && store.queue.length === 0, "本地版本撤销，队列清空");
    const after = store.orders.find((o) => o.id === order.id);
    assert(after?.stationId === "st-east", "服务端版本保留（对端改到的站）");
    assert(after?.revision === 2, "本地改派未生效，版本只含对端一次变更");
  }

  console.log("== 场景6：失败保留原操作可重试，已确认派单不可回退 ==");
  {
    const store = freshStore();
    const order = store.orders[2];
    store.setOutage(true);
    store.queueReassign(order, { stationId: "st-east", volume: 12000, slot: order.slot }, "");
    store.sync();
    assert(store.queue.length === 1, "同步失败，操作保留在队列");
    assert(store.queue[0].attempts === 1 && !!store.queue[0].lastError, "记录失败原因与尝试次数");
    store.retryOp(store.queue[0].id);
    assert(store.queue.length === 1 && store.queue[0].attempts === 2, "重试仍失败，操作继续保留");
    store.setOutage(false);
    store.retryOp(store.queue[0].id);
    assert(store.queue.length === 0, "故障解除后重试成功");
    assert(store.orders.find((o) => o.id === order.id)?.stationId === "st-east", "改派已确认");
    assert(typeof (store as Record<string, unknown>).removeOrder === "undefined", "无删除/回退已确认派单的入口");
  }

  console.log("== 场景7：断网可续作 —— 队列持久化，恢复后合并 ==");
  {
    const store = freshStore();
    store.setOnline(false);
    const order = store.orders[0];
    store.queueReassign(order, { stationId: "st-airport", volume: 20000, slot: order.slot }, "断网改派");
    store.sync();
    assert(store.queue.length === 1, "断网时操作留在队列");
    // 模拟刷新：新 pinia 实例从 localStorage 恢复
    setActivePinia(createPinia());
    const restored = useLedgerStore();
    assert(restored.queue.length === 1 && restored.queue[0].tripNo === order.tripNo, "刷新后队列可续作");
    restored.setOnline(true); // 恢复联网自动合并
    assert(restored.queue.length === 0, "恢复后自动合并完成");
    assert(restored.orders.find((o) => o.id === order.id)?.stationId === "st-airport", "断网改派最终确认");
  }

  console.log(failures === 0 ? "\n全部场景通过" : `\n${failures} 项失败`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
