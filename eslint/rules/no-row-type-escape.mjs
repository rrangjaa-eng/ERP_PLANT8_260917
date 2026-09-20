// T-03-15(threat_model): domain 출구의 DTO 강제 — type-aware 커스텀 규칙.
// eslint/rules/money-boundary.mjs의 골격을 그대로 따르되 세 곳만 다르다:
// (1) 탐지 대상이 export된 함수의 "반환 타입"이지 산술 연산자가 아니다.
// (2) 판정은 표시 문자열(typeToString)보다 심볼 이름을 먼저 본다 —
//     `type.aliasSymbol?.name ?? type.symbol?.name`. typeToString이 타입
//     별칭을 구조적 리터럴로 펼치면 이름 기반 탐지가 조용히 뚫린다(단일
//     이름 정규식에 의존한 money-boundary는 겪지 않는 문제다).
// (3) 예외 경로가 domain/seed 하나뿐이다(부트스트랩 전용, 03-01이 화면
//     계층에서 도달 불가함을 검증으로 고정했다). project(viewer, dto)
//     구현부 자체는 예외로 두지 않는다 — 그 함수의 반환 타입은 이미 Dto
//     제네릭 파라미터이므로 예외가 필요 없다.
const ROW_TYPE_NAME_PATTERN = /Row$/;

function pathSegments(filename) {
  return filename.split(/[/\\]/);
}

function isInDomain(filename) {
  return pathSegments(filename).includes("domain");
}

function isExemptPath(filename) {
  const segments = pathSegments(filename);
  return segments.some((segment, index) => segment === "domain" && segments[index + 1] === "seed");
}

function isExported(node) {
  let current = node;
  while (current) {
    if (current.type === "ExportNamedDeclaration" || current.type === "ExportDefaultDeclaration") {
      return true;
    }
    current = current.parent;
  }
  return false;
}

const noRowTypeEscape = {
  meta: {
    type: "problem",
    docs: {
      description:
        "domain/** 아래 export된 함수의 반환 타입에 리포지토리 행 타입(*Row)이 노출되는 것을 금지한다 (type-aware).",
    },
    schema: [],
    messages: {
      rowTypeLeak:
        "domain 함수의 반환 타입에 행 타입 '{{typeName}}'이 노출됩니다 — project()를 거친 *Dto만 반환하세요.",
      missingTypeInformation: "no-row-type-escape requires type information",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isInDomain(filename) || isExemptPath(filename)) {
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

    // Promise<T> · T[] · readonly T[] · 유니언을 재귀로 벗겨 실제 판정 대상
    // 타입들("잎")을 모은다. 유니언은 갈래마다 따로 판정해 하나라도 Row면 보고한다.
    function collectLeafTypes(type, seen) {
      if (seen.has(type)) return [];
      seen.add(type);

      if (type.isUnion()) {
        return type.types.flatMap((member) => collectLeafTypes(member, seen));
      }

      const symbolName = type.symbol?.name;
      if (symbolName === "Promise") {
        const typeArgs = checker.getTypeArguments(type);
        if (typeArgs && typeArgs.length > 0) {
          return typeArgs.flatMap((arg) => collectLeafTypes(arg, seen));
        }
      }

      if (checker.isArrayType(type)) {
        const typeArgs = checker.getTypeArguments(type);
        if (typeArgs && typeArgs.length > 0) {
          return typeArgs.flatMap((arg) => collectLeafTypes(arg, seen));
        }
      }

      return [type];
    }

    function rowTypeNameOfReturn(tsNode) {
      const signature = checker.getSignatureFromDeclaration(tsNode);
      if (!signature) return null;
      const returnType = checker.getReturnTypeOfSignature(signature);
      const leaves = collectLeafTypes(returnType, new Set());
      for (const leaf of leaves) {
        const name = leaf.aliasSymbol?.name ?? leaf.symbol?.name;
        if (name && ROW_TYPE_NAME_PATTERN.test(name)) {
          return name;
        }
      }
      return null;
    }

    function checkFunctionNode(node) {
      if (!isExported(node)) return;
      const tsNode = services.esTreeNodeToTSNodeMap.get(node);
      const typeName = rowTypeNameOfReturn(tsNode);
      if (typeName) {
        context.report({ node, messageId: "rowTypeLeak", data: { typeName } });
      }
    }

    return {
      FunctionDeclaration: checkFunctionNode,
      TSDeclareFunction: checkFunctionNode,
      "VariableDeclarator > ArrowFunctionExpression": (node) => checkFunctionNode(node),
      "VariableDeclarator > FunctionExpression": (node) => checkFunctionNode(node),
    };
  },
};

export default noRowTypeEscape;
