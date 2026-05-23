// Step 4에서 실제 Inngest 함수들이 여기에 추가됩니다
// 예: generate-video, auto-refund-deadletter, asset-rehost-refresh, insights-poller

export const functions: ReturnType<typeof import('../client').inngest.createFunction>[] = []
