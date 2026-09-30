<script setup lang="ts">
import { useLedgerStore } from "./ledger/store";
import LedgerMap from "./components/LedgerMap.vue";
import StationLedger from "./components/StationLedger.vue";
import DispatchBoard from "./components/DispatchBoard.vue";
import SyncCenter from "./components/SyncCenter.vue";
import InventoryStats from "./components/InventoryStats.vue";

const store = useLedgerStore();
const metricLabels = ["站点数", "已确认派单", "待同步", "待处理冲突"];
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业 · 本地保供台账（可续作）</p>
          <h1>油站保供调度台账</h1>
          <p class="subtitle">
            每站登记安全库存、可用车位与保底油量；改派先占用目标站车位，断网操作进入待同步队列，
            恢复后按站点、车次和字段基线合并，已确认派单不可回退。
          </p>
        </div>
        <div class="conn-bar">
          <button
            type="button"
            class="secondary"
            :class="{ toggled: !store.online }"
            @click="store.setOnline(!store.online)"
          >
            {{ store.online ? "● 在线" : "● 断网模式" }}
          </button>
          <button
            type="button"
            class="secondary"
            :class="{ toggled: store.outage }"
            @click="store.setOutage(!store.outage)"
          >
            {{ store.outage ? "服务端故障：开" : "服务端故障：关" }}
          </button>
        </div>
      </header>

      <p v-if="store.notice" class="notice">{{ store.notice }}</p>

      <section class="metrics">
        <article v-for="(label, index) in metricLabels" :key="label" class="metric">
          <span>{{ label }}</span>
          <strong>{{ store.metrics[index] }}</strong>
        </article>
      </section>

      <section class="workspace">
        <StationLedger />
        <div class="main-col">
          <LedgerMap />
          <DispatchBoard />
        </div>
      </section>

      <section class="bottom-grid">
        <SyncCenter />
        <InventoryStats />
      </section>
    </div>
  </main>
</template>
