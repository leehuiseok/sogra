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
// Provider selector
// =========================================================
// AI_IMAGE_PROVIDER > AI_PROVIDER 순으로 확인. 기본값 'gemini'.
// 'gemini' | 'openai'(='dalle3')

export function getImageProvider(): ImageProvider {
  const provider = (process.env.AI_IMAGE_PROVIDER ?? process.env.AI_PROVIDER ?? 'gemini').toLowerCase();
  if (provider === 'openai' || provider === 'dalle3') return dalle3ImageProvider;
  return geminiImageProvider;
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

// =========================================================
// Gemini 2.5 Flash Image (Nano Banana) 구현체
// =========================================================
// API: POST .../models/gemini-2.5-flash-image:generateContent
// 응답은 inlineData(base64). external_url 자리에 data URL 을 담아
// persistAsset(global fetch가 data URL 지원)로 Storage에 업로드한다.
// 가격(2026-05 기준 추정): 이미지 1장 ≈ $0.039

const GEMINI_IMAGE_MODEL_ID = 'gemini-2.5-flash-image';
const GEMINI_IMAGE_COST_USD = 0.039;

function briefToGeminiImagePrompt(brief: ContentBrief): string {
  const anyBrief = brief as unknown as Record<string, unknown>;
  const storeName = String(anyBrief['store_name'] ?? '');
  const offer = String(anyBrief['offer'] ?? anyBrief['action'] ?? '');
  const tone = String(anyBrief['tone'] ?? '');
  const visual = String(anyBrief['visual_style'] ?? anyBrief['style'] ?? '');
  const composed = [
    '한국 음식점 인스타그램 포스터 (정사각형, 1024x1024).',
    storeName && `매장: ${storeName}`,
    offer && `주제: ${offer}`,
    tone && `톤: ${tone}`,
    visual && `비주얼 스타일: ${visual}`,
    '식욕을 자극하는 따뜻한 조명, 깔끔한 구도, 한국어 카피 영역 여백 확보.',
  ]
    .filter(Boolean)
    .join('\n');
  return composed || JSON.stringify(brief);
}

export const geminiImageProvider: ImageProvider = {
  async generate(brief: ContentBrief): Promise<ImageGenerationResult> {
    if (isMockEnabled()) {
      return {
        external_url: buildMockImageUrl(brief),
        modelUsed: `${GEMINI_IMAGE_MODEL_ID}+mock`,
        cost_usd: 0,
      };
    }

    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
    }

    const prompt = briefToGeminiImagePrompt(brief);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL_ID}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini Image API 호출 실패: ${res.status} ${errText}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { mimeType?: string; data?: string };
          }>;
        };
      }>;
    };

    const inline = data.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData?.data,
    )?.inlineData;
    if (!inline?.data) {
      throw new Error('Gemini Image 응답에 inlineData 가 없습니다.');
    }

    // data URL 로 감싸서 persistAsset 에 위임 (Node fetch는 data: 스킴 지원)
    const mime = inline.mimeType ?? 'image/png';
    const external_url = `data:${mime};base64,${inline.data}`;

    return {
      external_url,
      modelUsed: GEMINI_IMAGE_MODEL_ID,
      cost_usd: GEMINI_IMAGE_COST_USD,
    };
  },

  async persistToStorage(args: ImagePersistArgs): Promise<ImagePersistResult> {
    return persistAsset({
      external_url: args.external_url,
      store_id: args.store_id,
      content_id: args.content_id,
      kind: args.kind,
      ext: 'png',
    });
  },
};
