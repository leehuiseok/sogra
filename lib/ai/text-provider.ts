// lib/ai/text-provider.ts
// Step 4 RI-3: 텍스트 생성 어댑터 (Claude Haiku / GPT-4o-mini)
// - 외부 SDK 없이 global fetch() 사용
// - MOCK_AI_PROVIDERS=true 인 경우 deterministic mock 반환

import type { ContentBrief } from '@/lib/prompts/content-brief';

export type TextGenerationResult = {
  text: string;
  modelUsed: string;
  cost_usd: number;
};

export interface TextProvider {
  generate(brief: ContentBrief): Promise<TextGenerationResult>;
}

// =========================================================
// Mock 판별 헬퍼
// =========================================================

function isMockEnabled(): boolean {
  return process.env.MOCK_AI_PROVIDERS === 'true';
}

// brief 를 안정 키로 직렬화 → mock 텍스트 결정성 보장
function stableBriefKey(brief: ContentBrief): string {
  try {
    return JSON.stringify(brief, Object.keys(brief as Record<string, unknown>).sort());
  } catch {
    return String(Date.now());
  }
}

// 결정적 mock 캡션 생성 — 브리프의 핵심 요소만 단순 합성
function buildMockCaption(brief: ContentBrief, modelTag: string): string {
  const anyBrief = brief as unknown as Record<string, unknown>;
  const storeName = String(anyBrief['store_name'] ?? anyBrief['storeName'] ?? '우리 매장');
  const offer = String(anyBrief['offer'] ?? anyBrief['action'] ?? anyBrief['promo'] ?? '오늘의 특별 메뉴');
  const tone = String(anyBrief['tone'] ?? '따뜻한');
  const cta = String(anyBrief['cta'] ?? anyBrief['call_to_action'] ?? '지금 방문하세요');
  return `[${modelTag} mock] ${storeName} · ${tone} 톤\n${offer}\n${cta} — key:${stableBriefKey(brief).slice(0, 16)}`;
}

// =========================================================
// Claude Haiku 구현체
// =========================================================
// 가격(2025-05 기준 추정): input $0.25 / 1M tok, output $1.25 / 1M tok
// 실제 호출은 Anthropic Messages API — fetch 직접 사용

const CLAUDE_MODEL_ID = 'claude-3-5-haiku-latest';
const CLAUDE_INPUT_COST_PER_1M = 0.25;
const CLAUDE_OUTPUT_COST_PER_1M = 1.25;

export const claudeHaikuTextProvider: TextProvider = {
  async generate(brief: ContentBrief): Promise<TextGenerationResult> {
    if (isMockEnabled()) {
      return {
        text: buildMockCaption(brief, 'claude-haiku'),
        modelUsed: `${CLAUDE_MODEL_ID}+mock`,
        cost_usd: 0,
      };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.');
    }

    const userPrompt = JSON.stringify(brief);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL_ID,
        max_tokens: 1024,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Claude Haiku API 호출 실패: ${res.status} ${errText}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text =
      data.content
        ?.filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string)
        .join('\n') ?? '';

    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    const cost_usd =
      (inputTokens / 1_000_000) * CLAUDE_INPUT_COST_PER_1M +
      (outputTokens / 1_000_000) * CLAUDE_OUTPUT_COST_PER_1M;

    return { text, modelUsed: CLAUDE_MODEL_ID, cost_usd };
  },
};

// =========================================================
// Gemini 2.5 Flash 구현체
// =========================================================
// API: POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
// 가격(2026-05 기준 추정): input $0.075 / 1M tok, output $0.30 / 1M tok

const GEMINI_FLASH_MODEL_ID = 'gemini-2.5-flash';
const GEMINI_FLASH_INPUT_COST_PER_1M = 0.075;
const GEMINI_FLASH_OUTPUT_COST_PER_1M = 0.3;

export const geminiFlashTextProvider: TextProvider = {
  async generate(brief: ContentBrief): Promise<TextGenerationResult> {
    if (isMockEnabled()) {
      return {
        text: buildMockCaption(brief, 'gemini-flash'),
        modelUsed: `${GEMINI_FLASH_MODEL_ID}+mock`,
        cost_usd: 0,
      };
    }

    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
    }

    const userPrompt = JSON.stringify(brief);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH_MODEL_ID}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini Flash API 호출 실패: ${res.status} ${errText}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('\n') ?? '';

    const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
    const cost_usd =
      (inputTokens / 1_000_000) * GEMINI_FLASH_INPUT_COST_PER_1M +
      (outputTokens / 1_000_000) * GEMINI_FLASH_OUTPUT_COST_PER_1M;

    return { text, modelUsed: GEMINI_FLASH_MODEL_ID, cost_usd };
  },
};

// =========================================================
// GPT-4o-mini 구현체 (fallback)
// =========================================================
// 가격(2025-05 기준 추정): input $0.15 / 1M tok, output $0.60 / 1M tok

const GPT4O_MINI_MODEL_ID = 'gpt-4o-mini';
const GPT4O_INPUT_COST_PER_1M = 0.15;
const GPT4O_OUTPUT_COST_PER_1M = 0.6;

// =========================================================
// Provider selector
// =========================================================
// AI_PROVIDER 환경변수로 선택 — 기본값은 'gemini'.
// 'gemini' | 'claude' | 'openai'

export function getTextProvider(): TextProvider {
  const provider = (process.env.AI_PROVIDER ?? 'gemini').toLowerCase();
  if (provider === 'claude' || provider === 'anthropic') return claudeHaikuTextProvider;
  if (provider === 'openai' || provider === 'gpt') return gpt4oMiniTextProvider;
  return geminiFlashTextProvider;
}

export const gpt4oMiniTextProvider: TextProvider = {
  async generate(brief: ContentBrief): Promise<TextGenerationResult> {
    if (isMockEnabled()) {
      return {
        text: buildMockCaption(brief, 'gpt-4o-mini'),
        modelUsed: `${GPT4O_MINI_MODEL_ID}+mock`,
        cost_usd: 0,
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY 환경변수가 설정되지 않았습니다.');
    }

    const userPrompt = JSON.stringify(brief);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GPT4O_MINI_MODEL_ID,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`GPT-4o-mini API 호출 실패: ${res.status} ${errText}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const text = data.choices?.[0]?.message?.content ?? '';
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    const cost_usd =
      (inputTokens / 1_000_000) * GPT4O_INPUT_COST_PER_1M +
      (outputTokens / 1_000_000) * GPT4O_OUTPUT_COST_PER_1M;

    return { text, modelUsed: GPT4O_MINI_MODEL_ID, cost_usd };
  },
};
