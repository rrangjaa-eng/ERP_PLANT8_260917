const ARITHMETIC_BINARY_OPERATORS = new Set(["+", "-", "*", "/", "%"]);
const COMPOUND_ASSIGNMENT_OPERATORS = new Set(["+=", "-=", "*=", "/="]);
const MONEY_TYPE_PATTERN = /\bMoney\b/;

/**
 * Money-typed arithmetic is only allowed inside domain/money (Issue 8) — every
 * arithmetic operator elsewhere is type-checked against the operand's TS type
 * string. Requires type information (parserServices.program); when absent the
 * rule reports the misconfiguration once per file instead of silently no-op'ing.
 */

function isExemptPath(filename) {
  const segments = filename.split(/[/\\]/);
  return segments.some((segment, index) => segment === "domain" && segments[index + 1] === "money");
}

const moneyBoundary = {
  meta: {
    type: "problem",
    docs: {
      description: "domain/money 밖에서 Money 타입 산술을 금지한다 (type-aware).",
    },
    schema: [],
    messages: {
      moneyArithmeticOutsideModule: "Money 타입 산술은 domain/money 모듈 안에서만 허용된다",
      missingTypeInformation: "money-boundary requires type information",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isExemptPath(filename)) {
      return {};
    }

    const services = context.sourceCode.parserServices;
    if (!services || !services.program) {
      let reported = false;
      return {
        Program(node) {
          if (!reported) {
            reported = true;
            context.report({ node, messageId: "missingTypeInformation" });
          }
        },
      };
    }

    const checker = services.program.getTypeChecker();

    function typeIsMoney(node) {
      const tsNode = services.esTreeNodeToTSNodeMap.get(node);
      const type = checker.getTypeAtLocation(tsNode);
      return MONEY_TYPE_PATTERN.test(checker.typeToString(type));
    }

    function anyOperandIsMoney(nodes) {
      return nodes.some((node) => node !== undefined && node !== null && typeIsMoney(node));
    }

    return {
      BinaryExpression(node) {
        if (!ARITHMETIC_BINARY_OPERATORS.has(node.operator)) return;
        if (anyOperandIsMoney([node.left, node.right])) {
          context.report({ node, messageId: "moneyArithmeticOutsideModule" });
        }
      },
      AssignmentExpression(node) {
        if (!COMPOUND_ASSIGNMENT_OPERATORS.has(node.operator)) return;
        if (anyOperandIsMoney([node.left, node.right])) {
          context.report({ node, messageId: "moneyArithmeticOutsideModule" });
        }
      },
      UpdateExpression(node) {
        if (anyOperandIsMoney([node.argument])) {
          context.report({ node, messageId: "moneyArithmeticOutsideModule" });
        }
      },
      UnaryExpression(node) {
        if (node.operator !== "-") return;
        if (anyOperandIsMoney([node.argument])) {
          context.report({ node, messageId: "moneyArithmeticOutsideModule" });
        }
      },
    };
  },
};

export default moneyBoundary;
