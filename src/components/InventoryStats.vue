<script setup lang="ts">
import { computed } from "vue";
import { useLedgerStore } from "../ledger/store";

const store = useLedgerStore();

/** 库存统计与地图、待处理清单读取同一份已确认结果 */
const rows = computed(() =>
  store.stationSummaries.map((s) => ({
    id: s.id,
    name: s.name,
    current: s.currentStock,
    safety: s.safetyStock,
    incoming: s.incoming,
    min: s.minGuaranteed,
    stockPct: Math.min(100, Math.round((s.currentStock / Math.max(s.safetyStock * 2, 1)) * 100)),
    guaranteePct: Math.min(100, Math.round((s.incoming / Math.max(s.min, 1)) * 100)),
    lowStock: s.lowStock,
    underGuarantee: s.underGuarantee
  }))
);
</script>

<template>
  <section class="panel">
    <h2>库存统计（已确认）</h2>
    <div class="stat-rows">
      <div v-for="row in rows" :key="row.id" class="stat-row">
        <span class="stat-name">{{ row.name }}</span>
        <div class="stat-bars">
          <div class="bar">
            <span>库存 {{ row.current }}L / 安全 {{ row.safety }}L</span>
            <div class="bar-track">
              <div class="bar-fill" :class="{ danger: row.lowStock }" :style="{ width: `${row.stockPct}%` }" />
            </div>
          </div>
          <div class="bar">
            <span>在途 {{ row.incoming }}L / 保底 {{ row.min }}L</span>
            <div class="bar-track">
              <div class="bar-fill" :class="{ warn: row.underGuarantee }" :style="{ width: `${row.guaranteePct}%` }" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
