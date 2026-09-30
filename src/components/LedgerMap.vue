<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLedgerStore } from "../ledger/store";

const store = useLedgerStore();
const el = ref<HTMLElement | null>(null);
let map: L.Map | null = null;
let layer: L.LayerGroup | null = null;

/** 地图只渲染已确认台账（含待同步占位的净移动），与统计、清单同源 */
function render() {
  if (!map || !layer) return;
  layer.clearLayers();
  for (const s of store.stationSummaries) {
    const color = s.lowStock ? "#c84b31" : s.underGuarantee ? "#b7791f" : "#176b87";
    L.circleMarker([s.lat, s.lng], {
      radius: 13,
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.7
    })
      .bindPopup(
        `<b>${s.name}</b>（${s.area}）<br/>` +
          `库存 ${s.currentStock}L / 安全库存 ${s.safetyStock}L<br/>` +
          `保底油量 ${s.minGuaranteed}L / 确认在途 ${s.incoming}L<br/>` +
          `车位 ${s.slot} 占用 ${s.used}/${s.slotCapacity}`
      )
      .addTo(layer);
  }
}

onMounted(() => {
  if (!el.value) return;
  map = L.map(el.value).setView([39.96, 116.45], 10);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
  render();
});

watch(() => store.stationSummaries, render);

onBeforeUnmount(() => {
  map?.remove();
  map = null;
  layer = null;
});
</script>

<template>
  <section class="panel map-panel">
    <div class="toolbar">
      <h2>站点地图（已确认）</h2>
      <span class="hint">红：库存紧张　黄：低于保底　蓝：正常</span>
    </div>
    <div ref="el" class="map" />
  </section>
</template>
