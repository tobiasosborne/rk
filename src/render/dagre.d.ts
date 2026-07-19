// Minimal ambient types for the vendored `dagre` devDependency (rk-fhd: M2 boundary review
// rejected the built-in layout, ordered the plan's "vendor dagre at build time" swap). dagre
// ships no .d.ts of its own; this declares only the surface src/render/dag.ts actually calls —
// not a full port of @types/dagre, which lags the 0.8.x API. `bun test`/`bun run selftest`/
// `bun build --compile` never type-check (tsconfig noEmit, no tsc gate in CLAUDE.md §4), so this
// file exists for editor/reviewer clarity, not as a build gate.
declare module "dagre" {
  interface DagreGraphOptions {
    rankdir?: "TB" | "BT" | "LR" | "RL";
    nodesep?: number;
    ranksep?: number;
    marginx?: number;
    marginy?: number;
  }

  interface DagreLaidOutGraphAttrs {
    width?: number;
    height?: number;
  }

  interface DagreNodeAttrs {
    width: number;
    height: number;
    x: number;
    y: number;
  }

  namespace graphlib {
    class Graph {
      setGraph(opts: DagreGraphOptions): this;
      graph(): DagreLaidOutGraphAttrs;
      setDefaultEdgeLabel(fn: () => unknown): this;
      setNode(id: string, attrs: { width: number; height: number }): this;
      setEdge(from: string, to: string): this;
      nodes(): string[];
      node(id: string): DagreNodeAttrs;
    }
  }

  function layout(g: graphlib.Graph): void;

  const dagre: { graphlib: typeof graphlib; layout: typeof layout };
  export default dagre;
}
