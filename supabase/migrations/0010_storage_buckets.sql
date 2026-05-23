-- 0010_storage_buckets.sql
-- Step 4 RI-3: 미디어 자산용 Storage 버킷 + RLS
-- 원칙:
--   - SELECT 는 해당 store_id 의 owner 만 허용 (path: {store_id}/{content_id}/...)
--   - INSERT / DELETE 는 service_role 만 — persistAsset() 가 admin client 로 호출
--   - public 버킷이 아님 → 외부 직접 접근 불가, 7일 signed URL 만 발급

-- =========================================================
-- media 버킷 생성 (멱등)
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', false)
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- RLS 정책
-- get_store_owner_id 는 0003_rls_policies.sql 에서 정의됨
-- storage.foldername(name) 는 path 를 array 로 분해 → 첫 segment 가 store_id
-- =========================================================

CREATE POLICY "media_select_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'media'
    AND get_store_owner_id(((storage.foldername(name))[1])::uuid) = auth.uid()
  );

CREATE POLICY "media_insert_service"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'media'
    AND auth.role() = 'service_role'
  );

CREATE POLICY "media_delete_service"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'media'
    AND auth.role() = 'service_role'
  );
