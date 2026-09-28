import { writeFileSync } from "node:fs";
import { generatePlayableSeasonEvidence } from "./playable-season-evidence-report.js";

const report = await generatePlayableSeasonEvidence();
writeFileSync("evidence/playable-season-1000-games.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
