// lib/ai/video-provider.ts
// Step 4 RI-3: 비디오 생성 어댑터 (Runway Gen-3 + Pika fallback)
// - 비디오는 비동기 (start → poll). Inngest 잡(Lane 4) 에서 폴링 호출.
// - external_url 만료 가능성 → persistToStorage 로 자체 Storage 복제.
// - MOCK_AI_PROVIDERS=true 시 즉시 succeeded 반환 (테스트용 placeholder mp4).

import type { ContentBrief } from '@/lib/prompts/content-brief';
import { persistAsset } from '@/lib/storage/persist-asset';

export type VideoJobStatus = 'processing' | 'succeeded' | 'failed';

export type VideoStartResult = {
  external_job_id: string;
  modelUsed: string;
};

export type VideoPollResult = {
  status: VideoJobStatus;
  external_url?: string;
  error?: string;
};

export type VideoPersistArgs = {
  external_url: string;
  store_id: string;
  content_id: string;
  kind: 'video';
};

export type VideoPersistResult = {
  storage_url: string;
  storage_path: string;
};

export interface VideoProvider {
  startGeneration(brief: ContentBrief): Promise<VideoStartResult>;
  pollStatus(job_id: string): Promise<VideoPollResult>;
  persistToStorage(args: VideoPersistArgs): Promise<VideoPersistResult>;
}

// =========================================================
// Mock helpers
// =========================================================

function isMockEnabled(): boolean {
  return process.env.MOCK_AI_PROVIDERS === 'true';
}

// 결정적 mock job_id — brief 시그니처 일부 + 모델 태그
function buildMockJobId(brief: ContentBrief, tag: string): string {
  const sig = JSON.stringify(brief).length.toString(36);
  return `mock-${tag}-${sig}`;
}

// 공개된 샘플 mp4 (구글 sample-videos). 실제 fetch 가능하여 persistAsset 통과.
const MOCK_VIDEO_URL =
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4';

// =========================================================
// Runway Gen-3 구현체
// =========================================================
// API 추정: POST https://api.runwayml.com/v1/image_to_video (실제 엔드포인트는 계정 권한 따라 상이)
// 비용은 second 당 과금 — v1 에서는 fixed 추정값 사용
// 폴링: GET https://api.runwayml.com/v1/tasks/{id}

const RUNWAY_MODEL_ID = 'runway-gen3';
const RUNWAY_API_BASE = 'https://api.runwayml.com/v1';

export const runwayGen3VideoProvider: VideoProvider = {
  async startGeneration(brief: ContentBrief): Promise<VideoStartResult> {
    if (isMockEnabled()) {
      return {
        external_job_id: buildMockJobId(brief, 'runway'),
        modelUsed: `${RUNWAY_MODEL_ID}+mock`,
      };
    }

    const apiKey = process.env.RUNWAY_API_KEY;
    if (!apiKey) {
      throw new Error('RUNWAY_API_KEY 환경변수가 설정되지 않았습니다.');
    }

    const anyBrief = brief as unknown as Record<string, unknown>;
    const prompt =
      String(anyBrief['video_prompt'] ?? anyBrief['offer'] ?? '') || JSON.stringify(brief);

    const res = await fetch(`${RUNWAY_API_BASE}/image_to_video`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'X-Runway-Version': '2024-11-06',
      },
      body: JSON.stringify({
        model: 'gen3a_turbo',
        promptText: prompt,
        duration: 5,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Runway start 실패: ${res.status} ${errText}`);
    }

    const data = (await res.json()) as { id?: string };
    if (!data.id) {
      throw new Error('Runway 응답에 id 가 없습니다.');
    }

    return { external_job_id: data.id, modelUsed: RUNWAY_MODEL_ID };
  },

  async pollStatus(job_id: string): Promise<VideoPollResult> {
    if (isMockEnabled()) {
      return { status: 'succeeded', external_url: MOCK_VIDEO_URL };
    }

    const apiKey = process.env.RUNWAY_API_KEY;
    if (!apiKey) {
      throw new Error('RUNWAY_API_KEY 환경변수가 설정되지 않았습니다.');
    }

    const res = await fetch(`${RUNWAY_API_BASE}/tasks/${encodeURIComponent(job_id)}`, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'X-Runway-Version': '2024-11-06',
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { status: 'failed', error: `Runway poll ${res.status}: ${errText}` };
    }

    const data = (await res.json()) as {
      status?: string;
      output?: string[];
      failure?: string;
    };

    const s = (data.status ?? '').toUpperCase();
    if (s === 'SUCCEEDED') {
      return { status: 'succeeded', external_url: data.output?.[0] };
    }
    if (s === 'FAILED' || s === 'CANCELLED') {
      return { status: 'failed', error: data.failure ?? 'unknown' };
    }
    return { status: 'processing' };
  },

  async persistToStorage(args: VideoPersistArgs): Promise<VideoPersistResult> {
    return persistAsset({
      external_url: args.external_url,
      store_id: args.store_id,
      content_id: args.content_id,
      kind: args.kind,
      ext: 'mp4',
    });
  },
};

// =========================================================
// Pika fallback 구현체
// =========================================================
// Runway 실패 시 Lane 4 잡이 재시도용으로 사용. 동일 인터페이스.
// 실제 Pika labs API 는 닫혀 있으므로 v1 에서는 mock 만 동작 가능 (실 호출 시 명시적 에러).

const PIKA_MODEL_ID = 'pika-fallback';

export const pikaFallbackVideoProvider: VideoProvider = {
  async startGeneration(brief: ContentBrief): Promise<VideoStartResult> {
    if (isMockEnabled()) {
      return {
        external_job_id: buildMockJobId(brief, 'pika'),
        modelUsed: `${PIKA_MODEL_ID}+mock`,
      };
    }
    throw new Error('pikaFallbackVideoProvider: 실제 호출은 v1 출시 범위 밖입니다.');
  },

  async pollStatus(_job_id: string): Promise<VideoPollResult> {
    if (isMockEnabled()) {
      return { status: 'succeeded', external_url: MOCK_VIDEO_URL };
    }
    return { status: 'failed', error: 'pika not implemented in v1' };
  },

  async persistToStorage(args: VideoPersistArgs): Promise<VideoPersistResult> {
    return persistAsset({
      external_url: args.external_url,
      store_id: args.store_id,
      content_id: args.content_id,
      kind: args.kind,
      ext: 'mp4',
    });
  },
};
