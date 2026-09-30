<script setup lang="ts">
import { computed } from "vue";
import { useLedgerStore } from "../ledger/store";
import type { SyncOp } from "../ledger/types";

const store = useLedgerStore();

const ops = computed(() => store.ops);
const pending = computed(() => store.pendingOps);

function statusLabel(op: SyncOp) {
  switch (op.status) {
    case "pending": return "待同步";
    case "syncing": return "同步中";
    case "confirmed": return "已确认";
    case "failed": return "失败";
    case "conflict": return "冲突";
    case "duplicate": return "重复(已生效)";
  }
}

function statusType(op: SyncOp) {
  switch (op.status) {
    case "pending": return "info";
    case "syncing": return "warning";
    case "confirmed": return "success";
    case "failed": return "danger";
    case "conflict": return "danger";
    case "duplicate": return "";
    default: return "";
  }
}

function payloadText(op: SyncOp) {
  const parts: string[] = [];
  if (op.payload.stationId) parts.push(`油站→${store.stationById(op.payload.stationId)?.name ?? op.payload.stationId}`);
  if (op.payload.slot) parts.push(`时段→${op.payload.slot}`);
  if (op.payload.fuelAmount !== undefined) parts.push(`油量→${op.payload.fuelAmount}L`);
  return parts.join("，") || "—";
}

function toggleOnline() {
  store.setOnline(!store.online);
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>待同步队列</h2>
      <div class="head-actions">
        <span class="online-state" :class="{ online: store.online }">
          <i class="dot" />{{ store.online ? "在线" : "断线" }}
        </span>
        <button type="button" class="secondary small" @click="toggleOnline">
          {{ store.online ? "模拟断线" : "恢复网络" }}
        </button>
        <button
          type="button"
          class="small"
          :disabled="!store.online || store.syncing || pending.length === 0"
          @click="store.syncAll()"
        >
          {{ store.syncing ? "同步中…" : "全部同步" }}
        </button>
      </div>
    </div>

    <div v-if="ops.length === 0" class="empty">暂无待同步操作</div>

    <div class="op-list">
      <article v-for="op in ops" :key="op.id" class="op" :class="op.status">
        <div class="op-head">
          <div class="op-title">
            <strong>{{ op.trainNumber }}</strong>
            <el-tag :type="statusType(op)" size="small" effect="light">{{ statusLabel(op) }}</el-tag>
          </div>
          <span class="op-time">{{ new Date(op.createdAt).toLocaleTimeString("zh-CN") }}</span>
        </div>
        <p class="op-payload">{{ payloadText(op) }}</p>
        <p v-if="op.error" class="op-error">{{ op.error }}</p>
        <p v-if="op.earliestSlot" class="op-earliest">最早可用时段：{{ op.earliestSlot }}</p>
        <p v-if="op.conflictFields?.length" class="op-conflict">
          冲突字段：{{ op.conflictFields.join("、") }}
        </p>
        <div class="op-actions">
          <button
            v-if="op.status === 'failed'"
            type="button"
            class="small"
            :disabled="!store.online || store.syncing"
            @click="store.retryOp(op.id)"
          >
            重试
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.panel-head h2 { margin: 0; font-size: 18px; }
.head-actions { display: flex; align-items: center; gap: 8px; }
.online-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #c84b31;
}
.online-state.online { color: #14724f; }
.online-state .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}
button.small { padding: 6px 10px; font-size: 13px; }
.empty { text-align: center; color: #69758c; padding: 24px; }
.op-list { display: grid; gap: 8px; max-height: 420px; overflow-y: auto; }
.op {
  border: 1px solid #dfe7f1;
  border-radius: 8px;
  padding: 10px 12px;
  background: #fbfcfe;
}
.op.failed { border-color: #e6a23c; background: #fdf6ec; }
.op.conflict { border-color: #c84b31; background: #fdecea; }
.op.duplicate { opacity: 0.7; }
.op-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.op-title { display: flex; align-items: center; gap: 8px; }
.op-title strong { font-size: 15px; }
.op-time { color: #9aa6b8; font-size: 12px; }
.op-payload { margin: 0; color: #445069; font-size: 13px; }
.op-error { margin: 4px 0 0; color: #c84b31; font-size: 12px; }
.op-earliest { margin: 4px 0 0; color: #b8821f; font-size: 12px; font-weight: 600; }
.op-conflict { margin: 4px 0 0; color: #c84b31; font-size: 12px; }
.op-actions { margin-top: 6px; display: flex; gap: 6px; }
</style>
