import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { createAttributeValueEvidence, runTreatment } from "../src/attribute-value-evidence.js";
import { eraBandsForSeason } from "../src/era-bands.js";
import { createCalibrationEvidence, runCalibrationForSize } from "../src/season-calibration-evidence.js";
import { runSweepForSize } from "../src/season-sweep-evidence.js";
import { readCommittedWeights, runStrengthForSize } from "../src/strength-resolution-evidence.js";

const ALLOWED_DEFAULTS = new Set([
  "attribute-value-evidence.ts:readAttributeWeights:path",
  "attribute-value-evidence.ts:runTreatment:teamFactory",
  "season-calibration-evidence.ts:verifyCommittedPositiveControl:committedJson",
  "strength-resolution-evidence.ts:runStrengthForSize:teamFactory",
]);

function exportedFunctions(statement: ts.Statement): Array<{ name: string; node: ts.FunctionLikeDeclaration }> {
  const exported = ts.canHaveModifiers(statement)
    && ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  if (!exported) return [];
  if (ts.isFunctionDeclaration(statement) && statement.name) return [{ name: statement.name.text, node: statement }];
  if (!ts.isVariableStatement(statement)) return [];
  return statement.declarationList.declarations.flatMap((declaration) => {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer
      || (!ts.isArrowFunction(declaration.initializer) && !ts.isFunctionExpression(declaration.initializer))) return [];
    return [{ name: declaration.name.text, node: declaration.initializer }];
  });
}

function exportedEvidenceFunctionsWithImplicitInputs(): string[] {
  const failures: string[] = [];
  for (const entry of readdirSync("src", { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith("-evidence.ts")) continue;
    const path = join("src", entry.name);
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      for (const exported of exportedFunctions(statement)) {
        const functionName = exported.name;
        const parameterNames = new Set(exported.node.parameters.map((parameter) => parameter.name.getText(source)));

        for (const parameter of exported.node.parameters) {
          const parameterName = parameter.name.getText(source);
          const location = `${basename(path)}:${functionName}:${parameterName}`;
          if (parameter.initializer && !ALLOWED_DEFAULTS.has(location)) failures.push(`${location} has a default`);
        }

        function findInputFallback(node: ts.Node): void {
          if (ts.isBinaryExpression(node)
            && (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
              || node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
            && parameterNames.has(node.left.getText(source))) {
            failures.push(`${basename(path)}:${functionName}:${node.left.getText(source)} has a ${node.operatorToken.getText(source)} fallback`);
          }
          ts.forEachChild(node, findInputFallback);
        }
        if (exported.node.body) findInputFallback(exported.node.body);
      }
    }
  }
  return failures;
}

describe("required evidence inputs", () => {
  it("rejects unapproved defaults and fallbacks in exported evidence functions", () => {
    expect(exportedEvidenceFunctionsWithImplicitInputs()).toEqual([]);
  });

  it("runTreatment uses its season input", () => {
    expect(() => runTreatment("passing", 0, 9, [1], 1980)).toThrow(/before the game starts/);
  });

  it("createAttributeValueEvidence uses its season input", () => {
    expect(() => createAttributeValueEvidence([1], 1980)).toThrow(/before the game starts/);
  });

  it("runCalibrationForSize uses its season input", () => {
    expect(() => runCalibrationForSize(8, [1], 1980, eraBandsForSeason(1981))).toThrow(/before the game starts/);
  });

  it("createCalibrationEvidence records its season input", () => {
    expect(createCalibrationEvidence([], [], 2001, eraBandsForSeason(1981)).controls.season).toBe(2001);
  });

  it("runSweepForSize uses its season input", () => {
    expect(() => runSweepForSize(8, [1], 1980)).toThrow(/before the game starts/);
  });

  it("runStrengthForSize uses its season input", () => {
    expect(() => runStrengthForSize(8, [1], 1980, readCommittedWeights())).toThrow(/before the game starts/);
  });
});
