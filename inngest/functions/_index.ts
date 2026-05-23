// Step 4 CB-2 / Decision 4 — Inngest 함수 모음
// serve() 등록은 Step 5 의 inngest webhook route 에서 수행.

import { generateVideo } from './generate-video'
import { autoRefundDeadletter } from './auto-refund-deadletter'
import { assetRehostRefresh } from './asset-rehost-refresh'
import { baselineCaptureTrigger } from './baseline-capture-trigger'
import { insightsPoller } from './insights-poller'
import { igMediaIdMatcher } from './ig-media-id-matcher'
import { billingDunning } from './billing-dunning'
import { billingGraceSweep } from './billing-grace-sweep'

export {
  generateVideo,
  autoRefundDeadletter,
  assetRehostRefresh,
  baselineCaptureTrigger,
  insightsPoller,
  igMediaIdMatcher,
  billingDunning,
  billingGraceSweep,
}

export const functions = [
  generateVideo,
  autoRefundDeadletter,
  assetRehostRefresh,
  baselineCaptureTrigger,
  insightsPoller,
  igMediaIdMatcher,
  billingDunning,
  billingGraceSweep,
]
