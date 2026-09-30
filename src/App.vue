<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useLedgerStore } from "./ledger/store";
import StationMap from "./components/StationMap.vue";
import StationStats from "./components/StationStats.vue";
import DispatchList from "./components/DispatchList.vue";
import ReassignForm from "./components/ReassignForm.vue";
import SyncQueue from "./components/SyncQueue.vue";

const store = useLedgerStore();
const { online, syncing, pendingCount, conflictDispatches, confirmedDispatches } = storeToRefs(store);

const project = {
  title: "保供台账",
  subtitle: "油站安全库存、车位与保底油量的本地可续作台账 —— 断线可改派，恢复后按字段基线合并。",
  industry: "石油",
};

const metrics = computed(() => [
  { label: "油站数", value: store.stations.length },
  { label: "已确认车次", value: confirmedDispatches.value.length },
  { label: "冲突待处理", value: conflictDispatches.value.length, warn: conflictDispatches.value.length > 0 },
  { label: "待同步操作", value: pendingCount.value, warn: pendingCount.value > 0 },
]);
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">{{ project.industry }}行业 · 本地保供台账</p>
          <h1>{{ project.title }}</h1>
          <p class="subtitle">{{ project.subtitle }}</p>
        </div>
        <div class="stack">
          <span class="tag" :class="{ 'tag-online': online, 'tag-offline': !online }">
            {{ online ? "在线" : "断线" }}
          </span>
          <span v-if="syncing" class="tag tag-sync">同步中…</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="m in metrics" :key="m.label" class="metric">
          <span>{{ m.label }}</span>
          <strong :class="{ 'num-warn': m.warn }">{{ m.value }}</strong>
        </article>
      </section>

      <section class="workspace">
        <div class="col-left">
          <ReassignForm />
          <SyncQueue />
        </div>
        <div class="col-right">
          <StationMap />
          <StationStats />
          <DispatchList />
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.topbar {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 24px;
  align-items: end;
  margin-bottom: 22px;
}
.eyebrow {
  margin: 0 0 8px;
  color: #176b87;
  font-weight: 700;
}
h1 {
  margin: 0;
  font-size: clamp(28px, 4vw, 40px);
  letter-spacing: 0;
}
.subtitle {
  margin: 10px 0 0;
  max-width: 720px;
  color: #5b667a;
  line-height: 1.7;
}
.stack {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.tag {
  border-radius: 999px;
  background: #fff;
  border: 1px solid #d9e2ee;
  color: #445069;
  padding: 7px 12px;
  font-size: 13px;
}
.tag-online { background: #e8f4ef; border-color: #bfe3d4; color: #14724f; }
.tag-offline { background: #fdecea; border-color: #f0c4bd; color: #c84b31; }
.tag-sync { background: #eef5fb; border-color: #c5dcf0; color: #176b87; }

.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}
.metric {
  background: #fff;
  border: 1px solid #dfe7f1;
  border-radius: 8px;
  padding: 16px;
}
.metric span {
  display: block;
  color: #69758c;
  font-size: 13px;
}
.metric strong {
  display: block;
  margin-top: 8px;
  font-size: 30px;
}
.num-warn { color: #e6a23c; }

.workspace {
  display: grid;
  grid-template-columns: minmax(300px, 380px) 1fr;
  gap: 18px;
  align-items: start;
}
.col-left, .col-right {
  display: grid;
  gap: 18px;
}

@media (max-width: 960px) {
  .workspace { grid-template-columns: 1fr; }
  .topbar { grid-template-columns: 1fr; }
  .stack { justify-content: flex-start; }
  .metrics { grid-template-columns: repeat(2, 1fr); }
}
</style>
