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

const props = withDefaults(
  defineProps<{
    mode: SplitMode;
    people: SplitPerson[];
    /** Optional pool/expense total in paisa for exact/percent hints */
    totalPaisa?: number;
    /** When true, inclusion is controlled elsewhere — show name only */
    lockIncluded?: boolean;
  }>(),
  { lockIncluded: false },
);

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
    return `Total shares: ${heads}`;
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
      <label v-if="!lockIncluded" class="check">
        <input
          type="checkbox"
          :checked="p.included"
          :aria-label="`Include ${p.displayName}`"
          @change="
            emit('change', p.participantId, {
              included: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        <span>{{ p.displayName }}</span>
      </label>
      <span v-else class="check">{{ p.displayName }}</span>

      <div v-if="p.included && mode === 'shares'" class="stepper">
        <span class="field-label" :id="`shares-${p.participantId}`">Shares</span>
        <button
          type="button"
          class="tl-icon-btn"
          :aria-label="`Decrease shares for ${p.displayName}`"
          @click="bump(p, 'shares', -1)"
        >
          −
        </button>
        <input
          class="num"
          type="number"
          min="1"
          :value="p.shares"
          :aria-labelledby="`shares-${p.participantId}`"
          @change="
            emit('change', p.participantId, {
              shares: Math.max(
                1,
                Number(($event.target as HTMLInputElement).value) || 1,
              ),
            })
          "
        />
        <button
          type="button"
          class="tl-icon-btn"
          :aria-label="`Increase shares for ${p.displayName}`"
          @click="bump(p, 'shares', 1)"
        >
          +
        </button>
      </div>

      <div v-else-if="p.included && mode === 'percent'" class="stepper">
        <span class="field-label">%</span>
        <button
          type="button"
          class="tl-icon-btn"
          :aria-label="`Decrease percent for ${p.displayName}`"
          @click="bump(p, 'percentBps', -1)"
        >
          −
        </button>
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
        <button
          type="button"
          class="tl-icon-btn"
          :aria-label="`Increase percent for ${p.displayName}`"
          @click="bump(p, 'percentBps', 1)"
        >
          +
        </button>
      </div>

      <div v-else-if="p.included && mode === 'exact'" class="stepper">
        <span class="field-label">Rs</span>
        <button
          type="button"
          class="tl-icon-btn"
          :aria-label="`Decrease amount for ${p.displayName}`"
          @click="bump(p, 'exactPaisa', -1)"
        >
          −
        </button>
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
        <button
          type="button"
          class="tl-icon-btn"
          :aria-label="`Increase amount for ${p.displayName}`"
          @click="bump(p, 'exactPaisa', 1)"
        >
          +
        </button>
      </div>

      <div v-else-if="p.included && mode === 'equal'" class="muted">1 share</div>
    </div>
  </div>
</template>

<style scoped>
.split-matrix {
  display: flex;
  flex-direction: column;
  gap: var(--tl-space-2);
}
.hint {
  margin: 0 0 var(--tl-space-1);
  font-size: var(--tl-text-xs);
  color: var(--tl-muted);
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--tl-space-2);
  min-height: var(--tl-control-h);
  padding: var(--tl-control-pad-y) var(--tl-control-pad-x);
  border-radius: var(--tl-control-radius);
  background: var(--tl-elevated);
  border: 1px solid var(--tl-hairline);
}
.check {
  display: flex;
  align-items: center;
  gap: var(--tl-space-2);
  font-size: var(--tl-control-font);
  min-width: 7rem;
  min-height: var(--tl-control-h);
}
.check input {
  width: 1.15rem;
  height: 1.15rem;
  accent-color: var(--tl-accent);
}
.stepper {
  display: flex;
  align-items: center;
  gap: var(--tl-space-2);
}
.field-label {
  font-size: var(--tl-text-xs);
  color: var(--tl-muted);
  width: 2.75rem;
  flex-shrink: 0;
  line-height: 1;
  display: flex;
  align-items: center;
  min-height: var(--tl-control-h);
}
.num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.75rem;
  min-height: var(--tl-control-h);
  text-align: center;
  border: 1px solid var(--tl-border);
  border-radius: var(--tl-control-radius);
  background: var(--tl-panel);
  color: var(--tl-text);
  padding: 0 var(--tl-space-2);
  font-size: var(--tl-control-font);
  appearance: textfield;
  -moz-appearance: textfield;
  box-sizing: border-box;
}
.num::-webkit-outer-spin-button,
.num::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.num.wide {
  width: 5.75rem;
}
.muted {
  font-size: var(--tl-text-xs);
  color: var(--tl-muted);
}
</style>
