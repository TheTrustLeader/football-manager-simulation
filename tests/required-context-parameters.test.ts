import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const CONTEXT_PARAMETER = /^(season|era|seed|weights)/i;

function exportedFunctionsWithImplicitContext(): string[] {
  const failures: string[] = [];
  for (const entry of readdirSync("src", { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    const path = join("src", entry.name);
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      if (!ts.isFunctionDeclaration(statement) || !statement.name
        || !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
      const functionName = statement.name.text;

      for (const parameter of statement.parameters) {
        const parameterName = parameter.name.getText(source);
        if (parameter.initializer && (CONTEXT_PARAMETER.test(parameterName)
          || parameter.initializer.getText(source).includes("readCommittedWeights"))) {
          failures.push(`${basename(path)}:${functionName}:${parameterName} has a default`);
        }
      }

      function findContextFallback(node: ts.Node): void {
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
          && CONTEXT_PARAMETER.test(node.left.getText(source))) {
          failures.push(`${basename(path)}:${functionName}:${node.left.getText(source)} has a ?? fallback`);
        }
        ts.forEachChild(node, findContextFallback);
      }
      if (statement.body) findContextFallback(statement.body);
    }
  }
  return failures;
}

describe("required simulation context", () => {
  it("does not let exported functions default season, era, seed, or weights inputs", () => {
    expect(exportedFunctionsWithImplicitContext()).toEqual([]);
  });
});
