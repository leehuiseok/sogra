// lib/storage/persist-asset.ts
// Step 4 RI-3: 외부 생성 URL(DALL·E, Runway 등)을 자체 Storage 로 복제
// - service-role 클라이언트 사용 (미디어 버킷 INSERT 권한)
// - 동일 (store_id, content_id, kind) 입력에 대해 멱등 (같은 파일 경로 + 1회만 업로드)
// - external_url 은 24h 윈도우 내 만료 가능성 있으므로 호출 시점 안에서만 유효

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

export type PersistAssetKind = 'poster' | 'video';

export type PersistAssetArgs = {
  external_url: string;
  store_id: string;
  content_id: string;
  kind: PersistAssetKind;
  // 파일 확장자 — provider 별 기본값을 호출 측에서 지정 (예: 'jpg', 'mp4')
  ext: string;
};

export type PersistAssetResult = {
  storage_url: string;
  storage_path: string;
};

const BUCKET_ID = 'media';
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7; // 7일

// service-role admin 클라이언트 — Storage INSERT 정책이 service_role 만 허용함
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'persistAsset: NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 누락되었습니다.',
    );
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// 멱등 키 — content_id 가 곧 idempotency key (Lane 4 가 같은 content_id 로 재시도)
// 동일 입력 → 동일 경로. timestamp 를 경로에 넣지 않고 prefix 폴더만 사용.
function buildStoragePath(args: Omit<PersistAssetArgs, 'external_url'>): string {
  const safeExt = args.ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  return `${args.store_id}/${args.content_id}/${args.kind}.${safeExt}`;
}

// MIME 추정 — 확장자 기반 (외부 응답 헤더가 비정상일 수 있어 우리가 결정)
function guessMime(kind: PersistAssetKind, ext: string): string {
  const e = ext.toLowerCase();
  if (kind === 'video') {
    if (e === 'mp4') return 'video/mp4';
    if (e === 'mov') return 'video/quicktime';
    if (e === 'webm') return 'video/webm';
    return 'video/mp4';
  }
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'png') return 'image/png';
  if (e === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export async function persistAsset(args: PersistAssetArgs): Promise<PersistAssetResult> {
  const admin = createAdminClient();
  const storage_path = buildStoragePath({
    store_id: args.store_id,
    content_id: args.content_id,
    kind: args.kind,
    ext: args.ext,
  });

  // 1) 멱등 체크 — 이미 같은 경로의 객체가 존재하면 업로드 스킵
  const { data: existing } = await admin.storage
    .from(BUCKET_ID)
    .list(`${args.store_id}/${args.content_id}`, { limit: 100 });

  const targetName = storage_path.split('/').pop();
  const alreadyExists =
    !!existing && !!targetName && existing.some((o) => o.name === targetName);

  if (!alreadyExists) {
    // 2) 외부 URL fetch → Buffer
    const res = await fetch(args.external_url);
    if (!res.ok) {
      throw new Error(`persistAsset: external_url fetch 실패 (${res.status}) ${args.external_url}`);
    }
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    // 3) Storage 업로드 — upsert:true 로 race condition 흡수 (멱등 보장 강화)
    const { error: uploadErr } = await admin.storage
      .from(BUCKET_ID)
      .upload(storage_path, buffer, {
        contentType: guessMime(args.kind, args.ext),
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`persistAsset: Storage 업로드 실패 — ${uploadErr.message}`);
    }
  }

  // 4) 7일 signed URL 발급
  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET_ID)
    .createSignedUrl(storage_path, SIGNED_URL_TTL_SEC);

  if (signErr || !signed?.signedUrl) {
    throw new Error(
      `persistAsset: signed URL 발급 실패 — ${signErr?.message ?? 'unknown'}`,
    );
  }

  return {
    storage_url: signed.signedUrl,
    storage_path,
  };
}
