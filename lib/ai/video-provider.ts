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
// Provider selector
// =========================================================
// AI_VIDEO_PROVIDER > AI_PROVIDER 순으로 확인. 기본값 'gemini'(Veo).
// 'gemini'(='veo') | 'runway' | 'pika'

export function getVideoProvider(): VideoProvider {
  const provider = (process.env.AI_VIDEO_PROVIDER ?? process.env.AI_PROVIDER ?? 'gemini').toLowerCase();
  if (provider === 'runway') return runwayGen3VideoProvider;
  if (provider === 'pika') return pikaFallbackVideoProvider;
  return geminiVeoVideoProvider;
}

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
// Gemini Veo 3 구현체
// =========================================================
// API: POST .../models/veo-3.0-generate-preview:predictLongRunning
// 응답으로 operation name 을 받고, GET .../{operation_name} 으로 폴링.
// 완료 시 generatedSamples[0].video.uri 가 fetch 가능한 URL(키 포함 필요).
// 가격은 second 당 과금 — v1 출시 기준 cost 는 startGeneration 시점에 추정값으로 기록한다.

const VEO_MODEL_ID = 'veo-3.0-generate-preview';
const VEO_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// 5초 짜리 영상 1개 기준 추정. 실제 사용량은 별도 모니터링.
const VEO_ESTIMATED_COST_USD = 0.75 * 5;

function veoBriefToPrompt(brief: ContentBrief): string {
  const anyBrief = brief as unknown as Record<string, unknown>;
  const offer = String(anyBrief['video_prompt'] ?? anyBrief['offer'] ?? '');
  const storeName = String(anyBrief['store_name'] ?? '');
  const composed = [
    '한국 음식점 인스타그램 릴스용 5초 영상 (9:16 세로).',
    storeName && `매장: ${storeName}`,
    offer && `주제: ${offer}`,
    '따뜻한 조명, 식욕을 자극하는 클로즈업, 부드러운 카메라 무브.',
  ]
    .filter(Boolean)
    .join('\n');
  return composed || JSON.stringify(brief);
}

export const geminiVeoVideoProvider: VideoProvider = {
  async startGeneration(brief: ContentBrief): Promise<VideoStartResult> {
    if (isMockEnabled()) {
      return {
        external_job_id: buildMockJobId(brief, 'veo'),
        modelUsed: `${VEO_MODEL_ID}+mock`,
      };
    }

    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
    }

    const res = await fetch(
      `${VEO_API_BASE}/models/${VEO_MODEL_ID}:predictLongRunning?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: veoBriefToPrompt(brief) }],
          parameters: { aspectRatio: '9:16' },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Veo start 실패: ${res.status} ${errText}`);
    }

    const data = (await res.json()) as { name?: string };
    if (!data.name) {
      throw new Error('Veo 응답에 operation name 이 없습니다.');
    }

    return { external_job_id: data.name, modelUsed: VEO_MODEL_ID };
  },

  async pollStatus(job_id: string): Promise<VideoPollResult> {
    if (isMockEnabled()) {
      return { status: 'succeeded', external_url: MOCK_VIDEO_URL };
    }

    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
    }

    // job_id 는 "models/.../operations/{id}" 형태. URL safe 하게 그대로 사용.
    const res = await fetch(
      `${VEO_API_BASE}/${job_id}?key=${encodeURIComponent(apiKey)}`,
      { method: 'GET' },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { status: 'failed', error: `Veo poll ${res.status}: ${errText}` };
    }

    const data = (await res.json()) as {
      done?: boolean;
      error?: { message?: string };
      response?: {
        generateVideoResponse?: {
          generatedSamples?: Array<{ video?: { uri?: string } }>;
        };
      };
    };

    if (data.error) {
      return { status: 'failed', error: data.error.message ?? 'unknown' };
    }
    if (!data.done) {
      return { status: 'processing' };
    }

    const uri =
      data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri) {
      return { status: 'failed', error: 'Veo 응답에 video.uri 가 없습니다.' };
    }

    // Veo 가 반환하는 uri 는 인증이 필요할 수 있어 key 쿼리를 부착해 둔다.
    const sep = uri.includes('?') ? '&' : '?';
    const external_url = `${uri}${sep}key=${encodeURIComponent(apiKey)}`;
    return { status: 'succeeded', external_url };
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

// startGeneration 호출 시점에 추정 비용을 기록하고 싶을 때 사용하는 helper.
export const VEO_START_ESTIMATED_COST_USD = VEO_ESTIMATED_COST_USD;

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
