<script setup lang="ts">
import { computed } from "vue";
import { useLedgerStore } from "../ledger/store";

const store = useLedgerStore();

// 经纬度投影到 100x100 平面（等距投影）
const projected = computed(() => {
  const lngs = store.stations.map((s) => s.lng);
  const lats = store.stations.map((s) => s.lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const pad = 8;
  return store.stations.map((s) => {
    const x = ((s.lng - minLng) / (maxLng - minLng || 1)) * (100 - pad * 2) + pad;
    const y = ((maxLat - s.lat) / (maxLat - minLat || 1)) * (100 - pad * 2) + pad;
    return { ...s, x, y };
  });
});

// 每个油站的占用情况（读取已确认结果）
function occupancyOf(stationId: string) {
  return store.stationStats.find((r) => r.station.id === stationId);
}
</script>

<template>
  <section class="panel map-panel">
    <div class="panel-head">
      <h2>油站网点地图</h2>
      <span class="hint">车位占用 / 库存预警均读取已确认台账</span>
    </div>
    <div class="map-canvas">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="map-svg">
        <defs>
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#dfe7f1" stroke-width="0.4" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#grid)" />
        <path
          d="M 10 50 Q 30 30 50 50 T 90 50"
          fill="none"
          stroke="#b8c6d9"
          stroke-width="0.6"
          stroke-dasharray="2 2"
        />
      </svg>
      <div
        v-for="s in projected"
        :key="s.id"
        class="marker"
        :class="{
          'is-full': occupancyOf(s.id) && occupancyOf(s.id)!.available <= 0,
          'is-warning': occupancyOf(s.id)?.belowSafety,
          'is-danger': occupancyOf(s.id)?.belowGuaranteed,
        }"
        :style="{ left: `${s.x}%`, top: `${s.y}%` }"
      >
        <div class="marker-dot" />
        <div class="marker-label">
          <strong>{{ s.name }}</strong>
          <span>{{ s.area }} · 车位 {{ occupancyOf(s.id)?.occupied }}/{{ s.parkingSpots }}</span>
          <span>库存 {{ s.stock }}L</span>
        </div>
      </div>
    </div>
    <div class="legend">
      <span><i class="dot dot-ok" />正常</span>
      <span><i class="dot dot-warn" />库存低于安全库存</span>
      <span><i class="dot dot-danger" />低于保底油量 / 车位满</span>
    </div>
  </section>
</template>

<style scoped>
.map-panel { grid-column: 1 / -1; }
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
}
.panel-head h2 { margin: 0; font-size: 18px; }
.hint { color: #69758c; font-size: 12px; }
.map-canvas {
  position: relative;
  height: 320px;
  border-radius: 10px;
  background: linear-gradient(160deg, #f4f8fc, #eaf1f8);
  overflow: hidden;
  border: 1px solid #dfe7f1;
}
.map-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.marker {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  z-index: 2;
}
.marker-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #176b87;
  border: 3px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
.marker.is-warning .marker-dot { background: #e6a23c; }
.marker.is-danger .marker-dot { background: #c84b31; }
.marker.is-full .marker-dot { background: #c84b31; }
.marker-label {
  background: #fff;
  border: 1px solid #dfe7f1;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(23, 107, 135, 0.12);
  display: flex;
  flex-direction: column;
}
.marker-label strong { color: #172033; }
.marker-label span { color: #536078; }
.legend {
  display: flex;
  gap: 16px;
  margin-top: 10px;
  font-size: 12px;
  color: #536078;
  flex-wrap: wrap;
}
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.legend .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dot-ok { background: #176b87; }
.dot-warn { background: #e6a23c; }
.dot-danger { background: #c84b31; }
</style>
