<script setup lang="ts">
import { computed } from "vue";
import { useLedgerStore } from "../ledger/store";
import type { Dispatch } from "../ledger/types";

const store = useLedgerStore();

const dispatches = computed(() =>
  [...store.dispatches].sort((a, b) => a.trainNumber.localeCompare(b.trainNumber))
);

function stationName(id: string) {
  return store.stationById(id)?.name ?? id;
}

function statusType(d: Dispatch) {
  if (d.status === "conflict") return "danger";
  return "success";
}

function statusText(d: Dispatch) {
  if (d.status === "conflict") return "冲突待处理";
  return "已确认";
}

function resolve(d: Dispatch, choice: "local" | "remote") {
  store.resolveConflict(d.id, choice);
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>车次派单列表</h2>
      <span class="hint">已确认派单不可回退</span>
    </div>
    <div class="dispatch-list">
      <article
        v-for="d in dispatches"
        :key="d.id"
        class="dispatch"
        :class="{ 'is-conflict': d.status === 'conflict' }"
      >
        <div class="dispatch-head">
          <div class="dispatch-title">
            <strong>{{ d.trainNumber }}</strong>
            <el-tag :type="statusType(d)" size="small" effect="light">{{ statusText(d) }}</el-tag>
          </div>
          <span class="slot">{{ d.slot }}</span>
        </div>

        <div class="dispatch-body">
          <div class="field"><span>停靠油站</span><em>{{ stationName(d.stationId) }}</em></div>
          <div class="field"><span>油量</span><em>{{ d.fuelAmount }}L</em></div>
        </div>

        <!-- 冲突处理：两版待处理 -->
        <div v-if="d.status === 'conflict'" class="conflict-box">
          <p class="conflict-reason">{{ d.conflictReason }}</p>
          <p class="conflict-tip">未处理前不能继续占用，请选择保留版本：</p>
          <div class="versions">
            <div class="version">
              <h4>本地改派版</h4>
              <p>油站：{{ stationName(d.localVersion?.stationId ?? d.stationId) }}</p>
              <p>时段：{{ d.localVersion?.slot ?? d.slot }}</p>
              <p>油量：{{ d.localVersion?.fuelAmount ?? d.fuelAmount }}L</p>
              <button type="button" @click="resolve(d, 'local')">保留本地版</button>
            </div>
            <div class="version">
              <h4>服务端现行版</h4>
              <p>油站：{{ stationName(d.remoteVersion?.stationId ?? d.stationId) }}</p>
              <p>时段：{{ d.remoteVersion?.slot ?? d.slot }}</p>
              <p>油量：{{ d.remoteVersion?.fuelAmount ?? d.fuelAmount }}L</p>
              <button type="button" class="secondary" @click="resolve(d, 'remote')">采用服务端版</button>
            </div>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
}
.panel-head h2 { margin: 0; font-size: 18px; }
.hint { color: #69758c; font-size: 12px; }
.dispatch-list { display: grid; gap: 10px; }
.dispatch {
  border: 1px solid #dfe7f1;
  border-radius: 8px;
  padding: 12px;
  background: #fbfcfe;
}
.dispatch.is-conflict {
  border-color: #e6a23c;
  background: #fdf6ec;
}
.dispatch-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.dispatch-title { display: flex; align-items: center; gap: 8px; }
.dispatch-title strong { font-size: 16px; }
.slot { color: #536078; font-size: 13px; }
.dispatch-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.field { display: flex; flex-direction: column; gap: 2px; }
.field span { color: #69758c; font-size: 12px; }
.field em { font-style: normal; color: #172033; font-size: 14px; }
.conflict-box {
  margin-top: 10px;
  border-top: 1px dashed #e6a23c;
  padding-top: 10px;
}
.conflict-reason { margin: 0 0 4px; color: #b8821f; font-size: 13px; font-weight: 600; }
.conflict-tip { margin: 0 0 8px; color: #69758c; font-size: 12px; }
.versions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.version {
  background: #fff;
  border: 1px solid #f0d9a8;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
}
.version h4 { margin: 0 0 6px; font-size: 13px; color: #b8821f; }
.version p { margin: 2px 0; color: #536078; }
.version button { margin-top: 8px; width: 100%; padding: 6px 10px; font-size: 13px; }
</style>
