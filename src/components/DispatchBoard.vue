<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useLedgerStore } from "../ledger/store";
import type { DispatchOrder } from "../ledger/types";
import { addHours, nextHourSlot } from "../ledger/slots";

const store = useLedgerStore();

const editingId = ref<string | null>(null);
const form = reactive({ stationId: "", volume: 0, slot: "", note: "" });
const hint = ref<{ orderId: string; reason: string; earliest?: string } | null>(null);

/** 可选时段：从下一整点起 12 个小时时段；订单当前时段不在范围内时保留显示 */
const slotOptions = computed(() => {
  const base = nextHourSlot();
  const list = Array.from({ length: 12 }, (_, i) => addHours(base, i));
  if (editingId.value && form.slot && !list.includes(form.slot)) list.unshift(form.slot);
  return list;
});

function statusOf(order: DispatchOrder): { text: string; kind: string } {
  if (store.blockedTrips.has(order.tripNo)) return { text: "冲突锁定", kind: "danger" };
  if (store.queuedByOrder.has(order.id)) return { text: "待同步", kind: "warn" };
  return { text: "已确认", kind: "ok" };
}

function pendingText(order: DispatchOrder): string | null {
  const op = store.queuedByOrder.get(order.id);
  if (!op) return null;
  const station = store.stationName(op.changes.stationId ?? order.stationId);
  const volume = op.changes.volume ?? order.volume;
  const slot = op.changes.slot ?? order.slot;
  return `待同步改派 → ${station} / ${volume}L / ${slot}`;
}

function openEditor(order: DispatchOrder) {
  const pending = store.queuedByOrder.get(order.id);
  form.stationId = pending?.changes.stationId ?? order.stationId;
  form.volume = pending?.changes.volume ?? order.volume;
  form.slot = pending?.changes.slot ?? order.slot;
  form.note = pending?.note ?? "";
  hint.value = null;
  editingId.value = order.id;
}

function submit(order: DispatchOrder) {
  const result = store.queueReassign(
    order,
    { stationId: form.stationId, volume: Number(form.volume), slot: form.slot },
    form.note
  );
  if (result.ok) {
    editingId.value = null;
    hint.value = null;
    store.say(`${order.tripNo} 已占用 ${store.stationName(form.stationId)} 车位，进入待同步队列`);
  } else {
    hint.value = { orderId: order.id, reason: result.reason, earliest: result.earliest };
  }
}

/** 容量不够时保留原派单，可一键改用最早可用时段再占用 */
function useEarliest(order: DispatchOrder) {
  if (!hint.value?.earliest) return;
  form.slot = hint.value.earliest;
  submit(order);
}
</script>

<template>
  <section class="panel">
    <div class="toolbar">
      <h2>派单与改派</h2>
      <span class="hint">已确认派单不可回退，改派先占用目标站车位</span>
    </div>

    <div class="record-grid">
      <article v-for="order in store.orders" :key="order.id" class="record">
        <div class="record-head">
          <p class="record-title">{{ order.tripNo }} · {{ order.vehicle }}</p>
          <span class="status" :class="statusOf(order).kind">{{ statusOf(order).text }}</span>
        </div>
        <div class="details">
          <span>目标站: {{ store.stationName(order.stationId) }}</span>
          <span>油量: {{ order.volume }}L</span>
          <span>到站时段: {{ order.slot }}</span>
          <span>版本: v{{ order.revision }}</span>
        </div>
        <p v-if="pendingText(order)" class="note">{{ pendingText(order) }}</p>
        <p v-if="store.blockedTrips.has(order.tripNo)" class="note danger-note">
          同一车次两边都改过，两版待处理；未处理前不能继续占用。
        </p>

        <div class="actions">
          <button
            type="button"
            :disabled="store.blockedTrips.has(order.tripNo)"
            @click="openEditor(order)"
          >
            改派
          </button>
          <button class="secondary" type="button" @click="store.simulateRemoteChange(order.id)">
            模拟对端改派
          </button>
        </div>

        <form v-if="editingId === order.id" class="form-grid editor" @submit.prevent="submit(order)">
          <label>
            目标站
            <select v-model="form.stationId">
              <option v-for="s in store.stations" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </label>
          <div class="pair">
            <label>
              油量 L
              <input v-model="form.volume" type="number" min="0" required />
            </label>
            <label>
              到站时段
              <select v-model="form.slot">
                <option v-for="s in slotOptions" :key="s" :value="s">{{ s }}</option>
              </select>
            </label>
          </div>
          <label>
            备注
            <input v-model="form.note" placeholder="改派原因（可选）" />
          </label>
          <div v-if="hint && hint.orderId === order.id" class="capacity-hint">
            <p>{{ hint.reason }}</p>
            <p v-if="hint.earliest">最早可用时段：{{ hint.earliest }}</p>
            <button v-if="hint.earliest" type="button" @click="useEarliest(order)">
              按最早时段占用
            </button>
          </div>
          <div class="actions">
            <button type="submit">占用目标站车位</button>
            <button class="secondary" type="button" @click="editingId = null">取消</button>
          </div>
        </form>
      </article>
    </div>
  </section>
</template>
