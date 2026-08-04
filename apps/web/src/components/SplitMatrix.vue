<script setup lang="ts">
import { computed } from "vue";
import type { SplitMode } from "@tripledger/types";
import { paisaToRupees } from "@tripledger/engine";

export interface SplitPerson {
  participantId: string;
  displayName: string;
  included: boolean;
  shares: number;
  percentBps: number;
  exactPaisa: number;
}

const props = defineProps<{
  mode: SplitMode;
  people: SplitPerson[];
  /** Optional pool/expense total in paisa for exact/percent hints */
  totalPaisa?: number;
}>();

const emit = defineEmits<{
  change: [participantId: string, patch: Partial<SplitPerson>];
}>();

const hint = computed(() => {
  const included = props.people.filter((p) => p.included);
  if (props.mode === "equal") {
    return `${included.length} people · equal share`;
  }
  if (props.mode === "shares") {
    const heads = included.reduce((s, p) => s + p.shares, 0);
    return `Total heads: ${heads}`;
  }
  if (props.mode === "percent") {
    const pct = included.reduce((s, p) => s + p.percentBps, 0) / 100;
    return `Percents: ${pct.toFixed(1)}% ${pct === 100 ? "✓" : "(must be 100%)"}`;
  }
  const sum = included.reduce((s, p) => s + p.exactPaisa, 0);
  const total = props.totalPaisa ?? 0;
  return `Exact: Rs ${paisaToRupees(sum).toFixed(2)} of ${paisaToRupees(total).toFixed(2)} ${
    total > 0 && sum === total ? "✓" : ""
  }`;
});

function bump(
  p: SplitPerson,
  field: "shares" | "percentBps" | "exactPaisa",
  delta: number,
) {
  if (field === "shares") {
    emit("change", p.participantId, {
      shares: Math.max(1, p.shares + delta),
    });
  } else if (field === "percentBps") {
    emit("change", p.participantId, {
      percentBps: Math.max(0, Math.min(10000, p.percentBps + delta * 100)),
    });
  } else {
    emit("change", p.participantId, {
      exactPaisa: Math.max(0, p.exactPaisa + delta * 100),
    });
  }
}
</script>

<template>
  <div class="split-matrix">
    <p class="hint">{{ hint }}</p>
    <div v-for="p in people" :key="p.participantId" class="row">
      <label class="check">
        <input
          type="checkbox"
          :checked="p.included"
          @change="
            emit('change', p.participantId, {
              included: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span>{{ p.displayName }}</span>
      </label>

      <div v-if="p.included && mode === 'shares'" class="stepper">
        <span class="field-label">Heads</span>
        <button type="button" class="btn" @click="bump(p, 'shares', -1)">−</button>
        <input
          class="num"
          type="number"
          min="1"
          :value="p.shares"
          @change="
            emit('change', p.participantId, {
              shares: Math.max(
                1,
                Number(($event.target as HTMLInputElement).value) || 1,
              ),
            })
          "
        />
        <button type="button" class="btn" @click="bump(p, 'shares', 1)">+</button>
      </div>

      <div v-else-if="p.included && mode === 'percent'" class="stepper">
        <span class="field-label">%</span>
        <button type="button" class="btn" @click="bump(p, 'percentBps', -1)">−</button>
        <input
          class="num"
          type="number"
          min="0"
          max="100"
          step="0.1"
          :value="p.percentBps / 100"
          @change="
            emit('change', p.participantId, {
              percentBps: Math.round(
                Number(($event.target as HTMLInputElement).value) * 100,
              ),
            })
          "
        />
        <button type="button" class="btn" @click="bump(p, 'percentBps', 1)">+</button>
      </div>

      <div v-else-if="p.included && mode === 'exact'" class="stepper">
        <span class="field-label">Rs</span>
        <button type="button" class="btn" @click="bump(p, 'exactPaisa', -1)">−</button>
        <input
          class="num wide"
          type="number"
          min="0"
          step="0.01"
          :value="paisaToRupees(p.exactPaisa)"
          @change="
            emit('change', p.participantId, {
              exactPaisa: Math.round(
                Number(($event.target as HTMLInputElement).value) * 100,
              ),
            })
          "
        />
        <button type="button" class="btn" @click="bump(p, 'exactPaisa', 1)">+</button>
      </div>

      <div v-else-if="p.included && mode === 'equal'" class="muted">1 share</div>
    </div>
  </div>
</template>

<style scoped>
.split-matrix {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.hint {
  margin: 0 0 0.25rem;
  font-size: 0.75rem;
  color: var(--tl-muted);
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 3rem;
  padding: 0.65rem 0.75rem;
  border-radius: 0.65rem;
  background: var(--tl-elevated);
  border: 1px solid var(--tl-hairline);
}
.check {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  font-size: 0.9rem;
  min-width: 7rem;
  min-height: 2.75rem;
}
.check input {
  width: 1.15rem;
  height: 1.15rem;
  accent-color: var(--tl-accent);
}
.stepper {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.field-label {
  font-size: 0.7rem;
  color: var(--tl-muted);
  width: 2.5rem;
}
.btn {
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid var(--tl-border);
  border-radius: 0.5rem;
  background: var(--tl-panel);
  color: var(--tl-text);
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
}
.btn:hover {
  border-color: var(--tl-accent);
}
.num {
  width: 3.75rem;
  min-height: 2.5rem;
  text-align: center;
  border: 1px solid var(--tl-border);
  border-radius: 0.5rem;
  background: var(--tl-panel);
  color: var(--tl-text);
  padding: 0.35rem;
  font-size: 0.95rem;
}
.num.wide {
  width: 5.75rem;
}
.muted {
  font-size: 0.75rem;
  color: var(--tl-muted);
}
</style>
