import { ENGINE_CONFIG } from "./engine-config.js";

export function conditionForDisplay(internalCondition: number): number {
  // The engine stores workload condition on its own scale. The UI shows the
  // performance percentage that the configured condition curve actually uses.
  const condition = ENGINE_CONFIG.condition;
  const boundedCondition = Math.max(0, Math.min(condition.scale, internalCondition));
  const fullConditionFactor = condition.base + condition.range;
  const currentConditionFactor = condition.base + condition.range * (boundedCondition / condition.scale);
  return (currentConditionFactor / fullConditionFactor) * 100;
}
