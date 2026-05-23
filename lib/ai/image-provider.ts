// lib/ai/image-provider.ts
// Step 4 RI-3: 이미지(포스터) 생성 어댑터 (DALL·E 3)
// - external_url 은 OpenAI 측에서 24h 후 만료되므로 persistToStorage 필수
// - MOCK_AI_PROVIDERS=true 시 placeholder URL 반환

import type { ContentBrief } from '@/lib/prompts/content-brief';
import { persistAsset } from '@/lib/storage/persist-asset';

export type ImageGenerationResult = {
  external_url: string;
  modelUsed: string;
  cost_usd: number;
};

export type ImagePersistArgs = {
  external_url: string;
  store_id: string;
  content_id: string;
  kind: 'poster';
};

export type ImagePersistResult = {
  storage_url: string;
  storage_path: string;
};

export interface ImageProvider {
  generate(brief: ContentBrief): Promise<ImageGenerationResult>;
  persistToStorage(args: ImagePersistArgs): Promise<ImagePersistResult>;
}

// =========================================================
// Mock helpers
// =========================================================

function isMockEnabled(): boolean {
  return process.env.MOCK_AI_PROVIDERS === 'true';
}

function buildMockImageUrl(brief: ContentBrief): string {
  // placehold.co — 결정적이고 외부 의존 적음. 실제 fetch 가능한 이미지.
  const anyBrief = brief as unknown as Record<string, unknown>;
  const label = encodeURIComponent(String(anyBrief['offer'] ?? 'mock-poster').slice(0, 30));
  return `https://placehold.co/1024x1024/png?text=${label}`;
}

// =========================================================
// DALL·E 3 구현체
// =========================================================
// 가격(2025-05 기준): 1024x1024 standard = $0.040/image
// API: POST https://api.openai.com/v1/images/generations

const DALLE3_MODEL_ID = 'dall-e-3';
const DALLE3_COST_USD = 0.04;

// ContentBrief → DALL·E prompt 문자열 변환
function briefToImagePrompt(brief: ContentBrief): string {
  const anyBrief = brief as unknown as Record<string, unknown>;
  const offer = String(anyBrief['offer'] ?? '');
  const tone = String(anyBrief['tone'] ?? '');
  const visual = String(anyBrief['visual_style'] ?? anyBrief['style'] ?? '');
  const storeName = String(anyBrief['store_name'] ?? '');
  // 시각 정보가 빈약하면 JSON 통째로 던져 모델이 알아서 해석
  const composed = [storeName, offer, tone, visual].filter(Boolean).join(', ');
  return composed || JSON.stringify(brief);
}

export const dalle3ImageProvider: ImageProvider = {
  async generate(brief: ContentBrief): Promise<ImageGenerationResult> {
    if (isMockEnabled()) {
      return {
        external_url: buildMockImageUrl(brief),
        modelUsed: `${DALLE3_MODEL_ID}+mock`,
        cost_usd: 0,
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY 환경변수가 설정되지 않았습니다.');
    }

    const prompt = briefToImagePrompt(brief);

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DALLE3_MODEL_ID,
        prompt,
        n: 1,
        size: '1024x1024',
        response_format: 'url',
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`DALL·E 3 API 호출 실패: ${res.status} ${errText}`);
    }

    const data = (await res.json()) as {
      data?: Array<{ url?: string }>;
    };

    const external_url = data.data?.[0]?.url;
    if (!external_url) {
      throw new Error('DALL·E 3 응답에 url 이 없습니다.');
    }

    return {
      external_url,
      modelUsed: DALLE3_MODEL_ID,
      cost_usd: DALLE3_COST_USD,
    };
  },

  async persistToStorage(args: ImagePersistArgs): Promise<ImagePersistResult> {
    // PNG/JPEG 모두 가능하지만 DALL·E 3 는 PNG 반환 → 확장자 png 고정
    const { storage_url, storage_path } = await persistAsset({
      external_url: args.external_url,
      store_id: args.store_id,
      content_id: args.content_id,
      kind: args.kind,
      ext: 'png',
    });
    return { storage_url, storage_path };
  },
};
