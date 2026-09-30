<script setup lang="ts">
import { computed } from "vue";
import { useLedgerStore } from "../ledger/store";

const store = useLedgerStore();

const rows = computed(() => store.stationStats);

const totals = computed(() => {
  const stations = store.stations.length;
  const confirmed = store.confirmedDispatches.length;
  const conflicts = store.conflictDispatches.length;
  const belowGuaranteed = rows.value.filter((r) => r.belowGuaranteed).length;
  return { stations, confirmed, conflicts, belowGuaranteed };
});
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>库存统计</h2>
      <span class="hint">同一份已确认结果</span>
    </div>
    <div class="totals">
      <div class="total"><span>油站</span><strong>{{ totals.stations }}</strong></div>
      <div class="total"><span>已确认车次</span><strong>{{ totals.confirmed }}</strong></div>
      <div class="total"><span>冲突待处理</span><strong class="num-warn">{{ totals.conflicts }}</strong></div>
      <div class="total"><span>低于保底油量</span><strong class="num-danger">{{ totals.belowGuaranteed }}</strong></div>
    </div>
    <div class="stat-list">
      <div v-for="row in rows" :key="row.station.id" class="stat-row">
        <div class="stat-info">
          <strong>{{ row.station.name }}</strong>
          <span>{{ row.station.area }}</span>
        </div>
        <div class="stat-bars">
          <div class="bar-line">
            <span>库存</span>
            <div class="track">
              <div
                class="fill"
                :class="{ warn: row.belowSafety, danger: row.belowGuaranteed }"
                :style="{ width: `${Math.min(100, (row.station.stock / (row.station.safetyStock * 2)) * 100)}%` }"
              />
            </div>
            <em>{{ row.station.stock }}L</em>
          </div>
          <div class="bar-line">
            <span>车位</span>
            <div class="track">
              <div
                class="fill fill-spot"
                :class="{ danger: row.available <= 0 }"
                :style="{ width: `${(row.occupied / row.station.parkingSpots) * 100}%` }"
              />
            </div>
            <em>{{ row.occupied }}/{{ row.station.parkingSpots }}</em>
          </div>
        </div>
      </div>
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
.totals {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}
.total {
  background: #f4f8fc;
  border-radius: 8px;
  padding: 10px;
  text-align: center;
}
.total span { display: block; color: #69758c; font-size: 12px; }
.total strong { display: block; margin-top: 4px; font-size: 22px; color: #172033; }
.num-warn { color: #e6a23c; }
.num-danger { color: #c84b31; }
.stat-list { display: grid; gap: 10px; }
.stat-row {
  border: 1px solid #dfe7f1;
  border-radius: 8px;
  padding: 10px 12px;
}
.stat-info {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.stat-info strong { font-size: 15px; }
.stat-info span { color: #69758c; font-size: 12px; }
.stat-bars { display: grid; gap: 6px; }
.bar-line {
  display: grid;
  grid-template-columns: 40px 1fr 70px;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: #536078;
}
.track {
  height: 8px;
  background: #e7edf4;
  border-radius: 999px;
  overflow: hidden;
}
.fill {
  height: 100%;
  background: linear-gradient(90deg, #176b87, #64b6ac);
  border-radius: inherit;
}
.fill.warn { background: linear-gradient(90deg, #e6a23c, #f0c78a); }
.fill.danger { background: linear-gradient(90deg, #c84b31, #e07a5f); }
.fill-spot { background: linear-gradient(90deg, #4a7fb5, #7fa8d4); }
.bar-line em { font-style: normal; text-align: right; color: #445069; }
</style>
