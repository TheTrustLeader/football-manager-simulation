#!/usr/bin/env bash
set -u

# The calibration file is CPU-bound for several minutes. Run it beside the
# remaining files so the complete suite stays inside CI's ten-minute limit,
# while keeping each Vitest process serial (parallel workers can starve Vitest's
# own RPC heartbeat during the longest synchronous statistical checks).
npx vitest run tests/season-calibration-evidence.test.ts --no-file-parallelism &
calibration_pid=$!
npx vitest run --pool=threads --poolOptions.threads.singleThread --testTimeout=15000 --no-file-parallelism --exclude tests/season-calibration-evidence.test.ts
remaining_exit=$?
wait "$calibration_pid"
calibration_exit=$?

if (( remaining_exit != 0 || calibration_exit != 0 )); then
  exit 1
fi
