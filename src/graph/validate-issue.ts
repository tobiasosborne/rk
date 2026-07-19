// PURITY: pure — no fs/network/clock (L3). The shared `GraphIssue` shape + constructors used by
// every src/graph/validate*.ts module. Split out on its own (not defined in validate.ts) so the
// sibling validate-{af,fr,conflicts}.ts modules can import it without a circular dependency on
// validate.ts itself.

export type GraphIssueSeverity = "ERROR" | "WARN";

export interface GraphIssue {
  severity: GraphIssueSeverity;
  nodeId?: string;
  message: string;
}

export function err(message: string, nodeId?: string): GraphIssue {
  return nodeId === undefined ? { severity: "ERROR", message } : { severity: "ERROR", nodeId, message };
}

export function warn(message: string, nodeId?: string): GraphIssue {
  return nodeId === undefined ? { severity: "WARN", message } : { severity: "WARN", nodeId, message };
}
