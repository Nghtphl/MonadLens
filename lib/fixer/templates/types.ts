export interface FixContext {
  variable?: string;
  functionName?: string;
}

export interface FixTemplate {
  id: string;
  ruleId: "P1_GLOBAL_COUNTER" | "M1_BLOCK_TIME_ASSUMPTION";
  title: string;
  original: string;
  modified: string;
  tradeoffs: readonly string[];
  apply(source: string, context?: FixContext): string;
}
