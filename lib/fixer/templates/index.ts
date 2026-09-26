import { blockTimestampTemplate } from "./blockTimestamp";
import { shardedCounterTemplate } from "./shardedCounter";

export type { FixContext, FixTemplate } from "./types";
export {
  BLOCK_TIMESTAMP_TRADEOFFS,
  blockTimestampTemplate,
} from "./blockTimestamp";
export {
  SHARDED_COUNTER_TRADEOFFS,
  shardedCounterTemplate,
} from "./shardedCounter";

export const FIX_TEMPLATES = {
  [shardedCounterTemplate.id]: shardedCounterTemplate,
  [blockTimestampTemplate.id]: blockTimestampTemplate,
} as const;

export type FixTemplateId = keyof typeof FIX_TEMPLATES;

export function getFixTemplate(id: string) {
  return FIX_TEMPLATES[id as FixTemplateId];
}
