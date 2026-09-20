import requireActionClient from "./rules/require-action-client.mjs";
import repositoryViewerParam from "./rules/repository-viewer-param.mjs";
import moneyBoundary from "./rules/money-boundary.mjs";
import noRowTypeEscape from "./rules/no-row-type-escape.mjs";

const plant8Plugin = {
  rules: {
    "require-action-client": requireActionClient,
    "repository-viewer-param": repositoryViewerParam,
    "money-boundary": moneyBoundary,
    "no-row-type-escape": noRowTypeEscape,
  },
};

export default plant8Plugin;
