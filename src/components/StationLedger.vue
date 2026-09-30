<script setup lang="ts">
import { reactive, ref } from "vue";
import { useLedgerStore } from "../ledger/store";

const store = useLedgerStore();
const areas = ["东区", "西区", "机场线"] as const;

const blank = {
  id: "",
  name: "",
  area: areas[0] as string,
  lng: 116.4,
  lat: 39.9,
  safetyStock: 10000,
  currentStock: 20000,
  minGuaranteed: 10000,
  slotCapacity: 1
};

const form = reactive({ ...blank });
const editing = ref(false);

function edit(id: string) {
  const s = store.stationById(id);
  if (!s) return;
  Object.assign(form, { ...s });
  editing.value = true;
}

function reset() {
  Object.assign(form, { ...blank });
  editing.value = false;
}

function submit() {
  store.upsertStation({
    id: editing.value ? form.id : undefined,
    name: form.name,
    area: form.area,
    lng: Number(form.lng),
    lat: Number(form.lat),
    safetyStock: Number(form.safetyStock),
    currentStock: Number(form.currentStock),
    minGuaranteed: Number(form.minGuaranteed),
    slotCapacity: Number(form.slotCapacity)
  });
  reset();
}
</script>

<template>
  <section class="panel">
    <h2>站点台账登记</h2>
    <form class="form-grid" @submit.prevent="submit">
      <label>
        油站名称
        <input v-model="form.name" required placeholder="如：东区二站" />
      </label>
      <label>
        区域
        <select v-model="form.area">
          <option v-for="a in areas" :key="a">{{ a }}</option>
        </select>
      </label>
      <div class="pair">
        <label>
          经度
          <input v-model="form.lng" type="number" step="0.0001" required />
        </label>
        <label>
          纬度
          <input v-model="form.lat" type="number" step="0.0001" required />
        </label>
      </div>
      <div class="pair">
        <label>
          安全库存 L
          <input v-model="form.safetyStock" type="number" min="0" required />
        </label>
        <label>
          当前库存 L
          <input v-model="form.currentStock" type="number" min="0" required />
        </label>
      </div>
      <div class="pair">
        <label>
          保底油量 L
          <input v-model="form.minGuaranteed" type="number" min="0" required />
        </label>
        <label>
          车位数/时段
          <input v-model="form.slotCapacity" type="number" min="1" required />
        </label>
      </div>
      <div class="actions">
        <button type="submit">{{ editing ? "保存站点" : "登记站点" }}</button>
        <button v-if="editing" class="secondary" type="button" @click="reset">取消编辑</button>
      </div>
    </form>

    <div class="station-list">
      <article v-for="s in store.stationSummaries" :key="s.id" class="record">
        <div class="record-head">
          <p class="record-title">{{ s.name }}</p>
          <span class="status" :class="{ warn: s.lowStock || s.underGuarantee }">
            {{ s.lowStock ? "库存紧张" : s.underGuarantee ? "低于保底" : "保供正常" }}
          </span>
        </div>
        <div class="details">
          <span>安全库存: {{ s.safetyStock }}L</span>
          <span>当前库存: {{ s.currentStock }}L</span>
          <span>保底油量: {{ s.minGuaranteed }}L</span>
          <span>确认在途: {{ s.incoming }}L</span>
          <span>车位 {{ s.slot }}: {{ s.used }}/{{ s.slotCapacity }}</span>
          <span>可用车位: {{ s.free }}</span>
        </div>
        <div class="actions">
          <button class="secondary" type="button" @click="edit(s.id)">编辑台账</button>
        </div>
      </article>
    </div>
  </section>
</template>
