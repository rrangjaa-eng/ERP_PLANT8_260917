/**
 * repositories/** exported functions must take `viewer` as their first
 * parameter (Issue 1·13A) — type exports and non-function const exports are
 * ignored.
 */

function isRepositoriesFile(filename) {
  const segments = filename.split(/[/\\]/);
  return segments.includes("repositories");
}

const repositoryViewerParam = {
  meta: {
    type: "problem",
    docs: {
      description: "repositories/** export 함수의 첫 인자는 viewer여야 한다.",
    },
    schema: [],
    messages: {
      missingViewerParam: "repository exports must take `viewer` as their first parameter",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isRepositoriesFile(filename)) {
      return {};
    }

    function checkParams(node) {
      const first = node.params && node.params[0];
      const isViewer = first !== undefined && first.type === "Identifier" && first.name === "viewer";
      if (!isViewer) {
        context.report({ node, messageId: "missingViewerParam" });
      }
    }

    return {
      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (!decl) return;
        if (decl.type === "FunctionDeclaration") {
          checkParams(decl);
        } else if (decl.type === "VariableDeclaration") {
          for (const declarator of decl.declarations) {
            const init = declarator.init;
            if (!init) continue;
            if (init.type === "FunctionExpression" || init.type === "ArrowFunctionExpression") {
              checkParams(init);
            }
          }
        }
      },
    };
  },
};

export default repositoryViewerParam;
