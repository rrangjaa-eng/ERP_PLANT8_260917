const DEFAULT_CLIENTS = ["authedActionClient"];

/**
 * "use server" export must be wrapped by an approved action client (Issue 2).
 *
 * Two independent checks:
 * 1. In a file whose Program.body[0] is a "use server" directive, every export
 *    must resolve to an approved action client chain (or be otherwise disallowed).
 * 2. Regardless of file, any function whose body opens with an inline "use server"
 *    directive is always disallowed — Next.js allows this form inside server
 *    components and it bypasses the wrapper check above.
 */

function isDirective(statement, value) {
  return (
    statement !== undefined &&
    statement.type === "ExpressionStatement" &&
    statement.expression !== undefined &&
    statement.expression.type === "Literal" &&
    statement.expression.value === value
  );
}

function getRootIdentifierName(node) {
  let current = node;
  while (current) {
    if (current.type === "CallExpression") {
      current = current.callee;
    } else if (current.type === "MemberExpression") {
      current = current.object;
    } else if (current.type === "Identifier") {
      return current.name;
    } else {
      return null;
    }
  }
  return null;
}

const requireActionClient = {
  meta: {
    type: "problem",
    docs: {
      description:
        "'use server' exports must be wrapped by an approved action client; inline 'use server' directives are forbidden.",
    },
    schema: [
      {
        type: "object",
        properties: {
          clients: {
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingActionClient: "use server export must be wrapped by an approved action client",
      inlineUseServer:
        "inline 'use server' is not allowed; move it to a 'use server' file and wrap with authedActionClient",
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const clients = options.clients || DEFAULT_CLIENTS;

    function checkTopLevelExports(program) {
      for (const statement of program.body) {
        if (statement.type === "ExportNamedDeclaration" && statement.declaration) {
          const decl = statement.declaration;
          if (decl.type === "FunctionDeclaration") {
            context.report({ node: statement, messageId: "missingActionClient" });
          } else if (decl.type === "VariableDeclaration") {
            for (const declarator of decl.declarations) {
              if (!declarator.init) continue;
              const rootName = getRootIdentifierName(declarator.init);
              if (!rootName || !clients.includes(rootName)) {
                context.report({ node: declarator.init, messageId: "missingActionClient" });
              }
            }
          }
        } else if (statement.type === "ExportDefaultDeclaration") {
          context.report({ node: statement, messageId: "missingActionClient" });
        }
      }
    }

    function checkFunctionBody(node) {
      const body = node.body;
      if (!body || body.type !== "BlockStatement") return;
      const first = body.body[0];
      if (isDirective(first, "use server")) {
        context.report({ node, messageId: "inlineUseServer" });
      }
    }

    return {
      Program(node) {
        if (isDirective(node.body[0], "use server")) {
          checkTopLevelExports(node);
        }
      },
      FunctionDeclaration: checkFunctionBody,
      FunctionExpression: checkFunctionBody,
      ArrowFunctionExpression: checkFunctionBody,
    };
  },
};

export default requireActionClient;
