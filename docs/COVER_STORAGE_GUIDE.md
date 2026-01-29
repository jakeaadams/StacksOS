# Cover Art Storage Guide

## Current Setup (Local Storage)

### Where Files Are Stored
- **Upload Directory**: `~/projects/stacksos/public/uploads/covers/`
- **Public URL**: `/uploads/covers/{filename}`
- **Served by**: Next.js static file serving

### How It Works
1. User uploads a file via the Cover Art Picker
2. File is saved to `public/uploads/covers/` with a unique filename
3. Filename format: `record-{recordId}-{timestamp}.{ext}`
4. URL is stored in component state (and can be persisted to Evergreen)

### API Endpoints Created
- **POST /api/upload-cover**: Handles file uploads
  - Validates file type (JPG, PNG, GIF, WEBP)
  - Validates file size (5MB max)
  - Returns public URL

- **POST /api/save-cover**: Saves cover preference
  - Currently logs to console
  - Ready to be extended with Evergreen integration

## Testing It Out

1. Navigate to any catalog record: `/staff/catalog/record/{id}`
2. Click on the cover image (or placeholder)
3. Try each tab:
   - **Browse Sources**: See covers from OpenLibrary & Google Books
   - **Custom URL**: Paste any image URL
   - **Upload File**: Upload a local image file

## Future Migration Options

### Option 1: Digital Ocean Spaces (Recommended)
When you move to Digital Ocean:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

Update `src/app/api/upload-cover/route.ts`:
```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "us-east-1", // or your DO region
  endpoint: "https://nyc3.digitaloceanspaces.com",
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY!,
    secretAccessKey: process.env.DO_SPACES_SECRET!,
  },
});

// Upload to Spaces instead of local filesystem
await s3.send(new PutObjectCommand({
  Bucket: "your-bucket-name",
  Key: `covers/${filename}`,
  Body: buffer,
  ACL: "public-read",
  ContentType: file.type,
}));

const publicUrl = `https://your-bucket.nyc3.cdn.digitaloceanspaces.com/covers/${filename}`;
```

**Cost**: ~$5/month for 250GB storage + CDN bandwidth

### Option 2: Cloudinary (Image CDN)
Best if you want automatic image optimization/resizing:

```bash
npm install cloudinary
```

**Cost**: Free tier includes 25GB storage, then ~$89/month

### Option 3: Keep Local + nginx
If you deploy to a VPS, serve uploads via nginx:

```nginx
location /uploads/ {
    alias /var/www/stacksos/public/uploads/;
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

## Persisting to Evergreen

When ready to save covers permanently, update `/api/save-cover/route.ts`:

### Option A: Direct PostgreSQL (Simplest)
```typescript
import { Pool } from 'pg';

const pool = new Pool({
  host: '192.168.1.232',
  database: 'evergreen',
  user: 'evergreen',
  password: process.env.EVERGREEN_DB_PASSWORD,
});

// Create custom table for cover URLs
await pool.query(`
  INSERT INTO library.custom_covers (record_id, cover_url, source, updated_at)
  VALUES ($1, $2, $3, NOW())
  ON CONFLICT (record_id)
  DO UPDATE SET cover_url = $2, source = $3, updated_at = NOW()
`, [recordId, coverUrl, source]);
```

### Option B: MARC 856 Field (Standards-compliant)
Update the MARC record to include a 856 field:
```xml
<datafield tag="856" ind1="4" ind2="2">
  <subfield code="3">Cover image</subfield>
  <subfield code="u">{coverUrl}</subfield>
</datafield>
```

You'd need to parse and update the MARC XML in `biblio.record_entry` table.

### Option C: Statistical Categories
Use Evergreen's stat_cat system for custom metadata:
```sql
-- Create stat cat if doesn't exist
INSERT INTO asset.stat_cat (owner, name, opac_visible)
VALUES (1, 'cover_image_url', false);

-- Save cover URL
INSERT INTO asset.stat_cat_entry_copy_map (stat_cat, stat_cat_entry, owning_copy)
VALUES (
  (SELECT id FROM asset.stat_cat WHERE name = 'cover_image_url'),
  'your-url-here',
  copy_id
);
```

## Migration Checklist

When moving to production:

- [ ] Choose storage provider (DO Spaces recommended)
- [ ] Set up bucket/space with public read access
- [ ] Add credentials to `.env`
- [ ] Update `/api/upload-cover/route.ts` with new storage
- [ ] Test uploads work
- [ ] Migrate existing files from `public/uploads/covers/` to new storage
- [ ] Update Evergreen integration in `/api/save-cover/route.ts`
- [ ] Add database migration to create custom covers table (if needed)
- [ ] Update catalog API to return custom cover URLs
- [ ] Test end-to-end flow

## Current Limitations

- ✅ Uploads work locally
- ✅ Multi-source cover browsing works
- ✅ UI is fully functional
- ⚠️  Cover preferences not persisted to Evergreen yet
- ⚠️  Files only stored on one server (not distributed)
- ⚠️  No CDN (direct Next.js serving is fine for local use)

## Recommendations

**For now (local development)**:
- ✅ Use local storage (already implemented)
- ✅ It's fast, simple, and free
- ✅ Perfect for testing the UI/UX

**When moving to Digital Ocean**:
1. Use DO Spaces for uploaded covers ($5/month)
2. Keep using OpenLibrary/Google Books APIs for fetched covers
3. Add Evergreen PostgreSQL integration to persist selections
4. Set up CDN for faster global delivery

**Backup strategy**:
- Add the `public/uploads/` directory to your backup routine
- Or better: migrate to object storage which has built-in redundancy
