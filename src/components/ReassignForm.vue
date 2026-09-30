<script setup lang="ts">
import { computed, ref } from "vue";
import { useLedgerStore } from "../ledger/store";
import { SLOTS } from "../ledger/seed";

const store = useLedgerStore();

const trainNumber = ref("");
const targetStationId = ref("");
const slot = ref<string>(SLOTS[1]);
const feedback = ref<{ type: "ok" | "warn" | "err"; text: string } | null>(null);

const trainOptions = computed(() =>
  store.dispatches
    .filter((d) => d.status === "confirmed")
    .map((d) => ({ value: d.trainNumber, label: `${d.trainNumber}（当前 ${store.stationById(d.stationId)?.name ?? "-"}）` }))
);

const stationOptions = computed(() =>
  store.stations.map((s) => ({ value: s.id, label: `${s.name}（${s.area}）` }))
);

// 选中目标油站后，实时显示该时段车位情况
const targetInfo = computed(() => {
  if (!targetStationId.value) return null;
  const station = store.stationById(targetStationId.value);
  if (!station) return null;
  const occupied = store.occupancyAt(targetStationId.value, slot.value);
  return {
    name: station.name,
    total: station.parkingSpots,
    occupied,
    available: station.parkingSpots - occupied,
  };
});

function submit() {
  feedback.value = null;
  if (!trainNumber.value || !targetStationId.value || !slot.value) {
    feedback.value = { type: "err", text: "请完整填写车次、目标油站和时段" };
    return;
  }
  const result = store.reassign(trainNumber.value, targetStationId.value, slot.value);
  if (result.ok) {
    feedback.value = {
      type: "ok",
      text: result.queued
        ? "已进入待同步队列，恢复网络后自动合并"
        : "改派已生效，目标车位已占用",
    };
  } else if (result.earliestSlot) {
    feedback.value = {
      type: "warn",
      text: `${result.reason}。最早可用时段：${result.earliestSlot}`,
    };
  } else {
    feedback.value = { type: "err", text: result.reason ?? "改派失败" };
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <h2>改派车次</h2>
      <span class="hint">先占用目标站车位</span>
    </div>
    <form class="form-grid" @submit.prevent="submit">
      <label>
        车次
        <select v-model="trainNumber" required>
          <option value="">请选择车次</option>
          <option v-for="opt in trainOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <label>
        目标油站
        <select v-model="targetStationId" required>
          <option value="">请选择油站</option>
          <option v-for="opt in stationOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </label>
      <label>
        占用时段
        <select v-model="slot" required>
          <option v-for="s in SLOTS" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>

      <div v-if="targetInfo" class="capacity-hint" :class="{ full: targetInfo.available <= 0 }">
        {{ targetInfo.name }} · 该时段车位 {{ targetInfo.occupied }}/{{ targetInfo.total }}
        <template v-if="targetInfo.available <= 0">（已满）</template>
        <template v-else>（剩余 {{ targetInfo.available }}）</template>
      </div>

      <button type="submit">确认改派</button>

      <transition name="fade">
        <p v-if="feedback" class="feedback" :class="feedback.type">{{ feedback.text }}</p>
      </transition>
    </form>
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
.form-grid { display: grid; gap: 12px; }
label { display: grid; gap: 6px; color: #445069; font-size: 14px; }
select {
  width: 100%;
  border: 1px solid #cfd8e5;
  border-radius: 8px;
  padding: 10px 12px;
  color: #172033;
  background: #fbfcfe;
}
.capacity-hint {
  font-size: 13px;
  color: #14724f;
  background: #e8f4ef;
  border-radius: 8px;
  padding: 8px 10px;
}
.capacity-hint.full {
  color: #c84b31;
  background: #fdecea;
}
button {
  border: 0;
  border-radius: 8px;
  padding: 10px 14px;
  background: #176b87;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
}
.feedback {
  margin: 0;
  padding: 10px;
  border-radius: 8px;
  font-size: 13px;
}
.feedback.ok { background: #e8f4ef; color: #14724f; }
.feedback.warn { background: #fdf6ec; color: #b8821f; }
.feedback.err { background: #fdecea; color: #c84b31; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
