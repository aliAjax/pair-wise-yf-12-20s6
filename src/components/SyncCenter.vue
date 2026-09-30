<script setup lang="ts">
import { useLedgerStore } from "../ledger/store";
import type { PendingOp } from "../ledger/types";

const store = useLedgerStore();

function describe(op: PendingOp): string {
  const parts: string[] = [];
  if (op.changes.stationId !== undefined) {
    parts.push(`站点 ${store.stationName(op.baseline.stationId)} → ${store.stationName(op.changes.stationId)}`);
  }
  if (op.changes.volume !== undefined) {
    parts.push(`油量 ${op.baseline.volume}L → ${op.changes.volume}L`);
  }
  if (op.changes.slot !== undefined) {
    parts.push(`时段 ${op.baseline.slot} → ${op.changes.slot}`);
  }
  return parts.join("；");
}
</script>

<template>
  <section class="panel">
    <div class="toolbar">
      <h2>同步中心</h2>
      <div class="actions">
        <span class="hint">上次合并：{{ store.lastSyncAt ? new Date(store.lastSyncAt).toLocaleTimeString() : "—" }}</span>
        <button type="button" :disabled="store.syncing" @click="store.sync()">
          {{ store.syncing ? "合并中…" : "立即合并" }}
        </button>
      </div>
    </div>

    <h3 class="subhead">待同步队列（{{ store.queue.length }}）</h3>
    <div v-if="store.queue.length === 0" class="empty">断网时的改派会进入队列，恢复后按站点、车次和字段基线合并</div>
    <article v-for="op in store.queue" :key="op.id" class="record">
      <div class="record-head">
        <p class="record-title">{{ op.tripNo }}</p>
        <span class="status warn">待同步 · 第 {{ op.attempts + 1 }} 次尝试</span>
      </div>
      <div class="details">
        <span>{{ describe(op) }}</span>
        <span>提交于 {{ new Date(op.createdAt).toLocaleString() }}</span>
      </div>
      <p v-if="op.note" class="note">{{ op.note }}</p>
      <p v-if="op.lastError" class="note danger-note">上次失败：{{ op.lastError }}（原操作已保留，可重试）</p>
      <div class="actions">
        <button class="secondary" type="button" @click="store.retryOp(op.id)">重试</button>
      </div>
    </article>

    <h3 class="subhead">待处理冲突（{{ store.conflicts.length }}）</h3>
    <div v-if="store.conflicts.length === 0" class="empty">同一车次两边都改过时，两版都会保留在这里</div>
    <article v-for="c in store.conflicts" :key="c.id" class="record conflict">
      <div class="record-head">
        <p class="record-title">{{ c.tripNo }} · 两版待处理</p>
        <span class="status danger">未处理前不能继续占用</span>
      </div>
      <div class="conflict-grid">
        <div>
          <h4>本地改派</h4>
          <p>站点：{{ store.stationName(c.local.changes.stationId ?? c.local.baseline.stationId) }}</p>
          <p>油量：{{ c.local.changes.volume ?? c.local.baseline.volume }}L</p>
          <p>时段：{{ c.local.changes.slot ?? c.local.baseline.slot }}</p>
        </div>
        <div>
          <h4>服务端当前（v{{ c.remote.revision }}）</h4>
          <p>站点：{{ store.stationName(c.remote.stationId) }}</p>
          <p>油量：{{ c.remote.volume }}L</p>
          <p>时段：{{ c.remote.slot }}</p>
        </div>
      </div>
      <div class="actions">
        <button type="button" @click="store.resolveConflict(c.id, 'local')">保留本地版本</button>
        <button class="secondary" type="button" @click="store.resolveConflict(c.id, 'remote')">保留服务端版本</button>
      </div>
    </article>
  </section>
</template>
