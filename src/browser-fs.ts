import seasonCounts from "../data/english-first-division-seasons.csv?raw";

/** Browser build replacement for the one read-only data file used by era bands. */
export function readFileSync(): string {
  return seasonCounts;
}
