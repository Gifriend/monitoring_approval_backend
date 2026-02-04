-- =====================================================
-- Supabase Storage Setup SQL Script
-- Project: Monitoring Approval Backend
-- Date: February 3, 2026
-- =====================================================

-- 1. CREATE BUCKET
-- Note: Jika bucket sudah ada, skip bagian ini atau hapus dulu via UI
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- 2. DROP EXISTING POLICIES (jika ada)
-- Jalankan ini jika ingin reset policies
DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow owner deletes" ON storage.objects;

-- 3. CREATE POLICY: Public Read Access
-- Siapapun bisa baca file di bucket documents
CREATE POLICY "Allow public reads"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'documents');

-- 4. CREATE POLICY: Authenticated Upload
-- User yang login bisa upload file
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- 5. CREATE POLICY: Authenticated Update
-- User yang login bisa update file
CREATE POLICY "Allow authenticated updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'documents')
WITH CHECK (bucket_id = 'documents');

-- 6. CREATE POLICY: Authenticated Delete
-- User yang login bisa delete file
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'documents');

-- =====================================================
-- OPTIONAL: More Restrictive Policies
-- =====================================================

-- Jika ingin hanya owner yang bisa delete file mereka sendiri:
-- Uncomment ini dan comment policy "Allow authenticated deletes" di atas
/*
CREATE POLICY "Allow owner deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' 
  AND auth.uid()::text = owner::text
);
*/

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Cek apakah bucket sudah dibuat
SELECT * FROM storage.buckets WHERE id = 'documents';

-- Cek policies yang aktif
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'objects' 
  AND schemaname = 'storage';

-- Cek jumlah file di bucket (setelah upload)
SELECT 
  bucket_id,
  COUNT(*) as file_count,
  SUM(
    CASE 
      WHEN metadata->>'size' IS NOT NULL 
      THEN (metadata->>'size')::bigint 
      ELSE 0 
    END
  ) as total_size_bytes,
  ROUND(
    SUM(
      CASE 
        WHEN metadata->>'size' IS NOT NULL 
        THEN (metadata->>'size')::bigint 
        ELSE 0 
      END
    )::numeric / 1024 / 1024, 2
  ) as total_size_mb
FROM storage.objects
WHERE bucket_id = 'documents'
GROUP BY bucket_id;

-- =====================================================
-- CLEANUP (OPTIONAL - USE WITH CAUTION)
-- =====================================================

-- Hapus semua file di bucket (HATI-HATI!)
-- DELETE FROM storage.objects WHERE bucket_id = 'documents';

-- Hapus bucket (HATI-HATI!)
-- DELETE FROM storage.buckets WHERE id = 'documents';

-- =====================================================
-- NOTES
-- =====================================================

/*
1. Jalankan script ini di Supabase SQL Editor:
   Dashboard > SQL Editor > New Query > Paste & Run

2. Bucket "documents" akan di-set sebagai PUBLIC
   - Siapapun bisa baca file via public URL
   - Hanya authenticated users bisa upload/delete

3. Jika bucket sudah ada, bagian INSERT akan di-skip otomatis

4. Untuk production, pertimbangkan:
   - Set bucket private dan pakai signed URLs
   - Tambahkan size limits
   - Tambahkan file type restrictions

5. Monitor storage usage di:
   Dashboard > Storage > documents

6. Storage limits (Free tier):
   - 1 GB storage
   - 2 GB bandwidth/bulan
   - Upgrade ke Pro: $25/bulan untuk 100GB

7. Backup:
   Supabase otomatis backup database, tapi tidak file storage.
   Untuk backup file, export via Supabase CLI atau API.
*/
