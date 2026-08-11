import { ENGINE_CONFIG } from "./engine-config.js";

const CONFIG_PATH = "ENGINE_CONFIG.squadGeneration.identityParity.interimAdjustmentsUntilCrossingIsConsumed";

function hasNonZeroAdjustment(adjustments: object): boolean {
  return Object.values(adjustments).some((value) => value !== 0);
}

export function readParityCompensationState() {
  const adjustments = ENGINE_CONFIG.squadGeneration.identityParity.interimAdjustmentsUntilCrossingIsConsumed;
  const activeIdentities = (Object.keys(adjustments) as Array<keyof typeof adjustments>).filter((identity) => {
    const identityAdjustments = adjustments[identity];
    return hasNonZeroAdjustment(identityAdjustments.outfield)
      || hasNonZeroAdjustment(identityAdjustments.goalkeeper);
  });

  const includedInMeasuredResults = activeIdentities.length > 0;
  return {
    state: includedInMeasuredResults ? "in" : "out",
    includedInMeasuredResults,
    configPath: CONFIG_PATH,
    activeIdentities,
    adjustments,
  };
}
