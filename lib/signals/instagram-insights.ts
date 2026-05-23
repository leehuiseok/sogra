export type InsightsSignal = {
  recentReachAvg: number;
  recentLikesAvg: number;
  trendingHashtags: string[];
  available: boolean;
};

// Step 5 (inngest/functions/insights-poller.ts)에서 본격 구현. v1 stub.
export async function getInstagramInsightsSignal(
  _storeId: string,
  _accessToken?: string,
  _igUserId?: string,
): Promise<InsightsSignal> {
  return { recentReachAvg: 0, recentLikesAvg: 0, trendingHashtags: [], available: false };
}
