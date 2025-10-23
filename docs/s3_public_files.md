# S3 Public Assets + CloudFront - Complete Implementation Plan

## Overview

**Goal**: Migrate practice website images from `/public/uploads/` to S3 with CloudFront CDN, using a fully generic service that can be reused for any public asset.

**Key Principles**:
- Generic, reusable S3 service (no hardcoded asset types)
- Private S3 bucket + CloudFront OAI (secure)
- Auto-detection (uses S3 if configured, falls back to local)
- Backward compatible (existing `/uploads/*` URLs continue working)
- No CDK - AWS CLI for infrastructure

**Architecture**:
```
User Request
    ↓
https://cdn.bendcare.com/practices/123/logo.jpg
    ↓
CloudFront Distribution (cached, fast)
    ↓
Origin Access Identity (OAI)
    ↓
S3 Bucket (private - only CloudFront can read)
bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058
```

**Infrastructure Details**:
- AWS Account ID: `854428944440`
- S3 Bucket: `bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058`
- CloudFront Domain: `cdn.bendcare.com`
- ACM Certificate: `arn:aws:acm:us-east-1:854428944440:certificate/050ddf8e-cfd0-46a3-befc-baf335c8eb26`
- Route53 Hosted Zone: `Z05961102TVIVESKQ4GAL`

---

## Phase 0: Infrastructure Setup (CloudFront + S3)

**Goal**: Create CloudFront distribution with OAI, configure S3 bucket policy

### Tasks:

**0.1** Create `scripts/cloudfront/` directory structure
- `scripts/cloudfront/setup-cdn.sh` - Main setup script
- `scripts/cloudfront/cloudfront-config.json` - Distribution config template
- `scripts/cloudfront/README.md` - Setup documentation

**0.2** Create OAI (Origin Access Identity)
- AWS CLI command: `aws cloudfront create-cloud-front-origin-access-identity`
- Capture OAI ID for bucket policy and distribution config
- Store OAI ID in output file for reference

**0.3** Update S3 bucket policy
- Allow CloudFront OAI to read (`s3:GetObject`)
- Allow ECS task role to write (`s3:PutObject`, `s3:DeleteObject`)
- Keep bucket block public access enabled
- Verify bucket policy is applied correctly

**0.4** Create CloudFront distribution configuration
- Origin: S3 bucket with OAI
- Alternate domain name: `cdn.bendcare.com`
- SSL certificate: `arn:aws:acm:us-east-1:854428944440:certificate/050ddf8e-cfd0-46a3-befc-baf335c8eb26`
- Cache policy: Optimized for images (1 year TTL)
- Compression enabled
- Viewer protocol: Redirect HTTP to HTTPS
- Price class: Use all edge locations or PriceClass_100 (cost optimization)

**0.5** Create CloudFront distribution
- AWS CLI command: `aws cloudfront create-distribution`
- Capture distribution ID and CloudFront domain name
- Wait for deployment status (or note it takes 15-20 minutes)

**0.6** Create Route53 DNS record
- Create A record for `cdn.bendcare.com`
- Alias target: CloudFront distribution
- Hosted zone: `Z05961102TVIVESKQ4GAL`
- Verify DNS propagation

**0.7** Test CloudFront access
- Upload test file to S3
- Verify direct S3 URL is blocked (403 Forbidden)
- Verify CloudFront URL works (200 OK)
- Test HTTPS enforcement

**0.8** Document environment variables
- Output required env vars: `CDN_URL=https://cdn.bendcare.com`
- Document AWS credentials requirements
- Create `.env.example` entries

**Deliverables**:
- ✅ CloudFront distribution operational
- ✅ `cdn.bendcare.com` resolves to CloudFront
- ✅ S3 bucket private but accessible via CloudFront
- ✅ Setup scripts documented and tested

---

## Phase 1: Core S3 Service Layer

**Goal**: Create generic, reusable S3 public assets service

### Tasks:

**1.1** Create `lib/s3/public-assets.ts`
- S3 client initialization (with credentials from env)
- Constants: `BUCKET_NAME`, `CDN_URL` from environment
- `isS3Configured()` - Check if credentials exist

**1.2** Implement `generateS3Key()` function
- Parameters: `pathSegments: string[]`, `fileName: string`, `options?: {...}`
- Options: `addUniqueId`, `preserveName`, `addTimestamp`, `uniqueIdLength`
- Sanitize path segments (replace invalid chars)
- Sanitize filename (lowercase, replace special chars)
- Generate unique ID with nanoid
- Build S3 key: `{segments}/{filename}_{uniqueId}.ext`
- Add comprehensive JSDoc examples

**1.3** Implement `uploadToS3()` function
- Parameters: `buffer: Buffer`, `s3Key: string`, `options: UploadOptions`
- Options: `contentType`, `cacheControl`, `metadata`
- Validate S3 is configured (throw error if not)
- Create `PutObjectCommand` with all options
- Send command via S3 client
- Log success with s3Key, size, duration
- Return `UploadResult` with `fileUrl`, `s3Key`, `size`, `contentType`
- Handle errors with detailed logging

**1.4** Implement `deleteFromS3()` function
- Parameters: `s3Key: string`
- Create `DeleteObjectCommand`
- Send command via S3 client
- Log success/failure
- Handle errors gracefully

**1.5** Implement `fileExistsInS3()` function
- Parameters: `s3Key: string`
- Create `HeadObjectCommand`
- Return `true` if exists, `false` if NotFound error
- Handle other errors appropriately
- Log results

**1.6** Implement utility functions
- `getPublicUrl(s3Key)` - Convert S3 key to CloudFront URL
- `extractS3Key(url)` - Extract S3 key from CloudFront URL (for migrations)
- `getBucketName()` - Return bucket name
- `getCdnUrl()` - Return CDN URL

**1.7** Add TypeScript types
- `UploadResult` interface
- `UploadOptions` interface
- Export all types

**1.8** Add comprehensive JSDoc comments
- Document all functions with examples
- Show various use cases (practices, users, orgs, marketing, etc.)
- Document return types and errors

**Deliverables**:
- ✅ `lib/s3/public-assets.ts` with all functions
- ✅ Full TypeScript typing
- ✅ Comprehensive documentation

---

## Phase 2: Unit Tests

**Goal**: Test S3 service functions in isolation

### Tasks:

**2.1** Create `tests/unit/s3/public-assets.test.ts`

**2.2** Test `generateS3Key()` with various scenarios
- Basic key generation with default options
- Key generation without unique ID
- Key generation with timestamp
- Key generation with custom unique ID length
- Multiple path segments
- Filename sanitization (special chars, spaces)
- Path segment sanitization
- Extension preservation
- Verify format matches pattern

**2.3** Test `getPublicUrl()`
- Converts S3 key to CloudFront URL
- Handles keys with multiple path segments
- Handles keys with special characters (encoded properly)

**2.4** Test `extractS3Key()`
- Extracts key from CloudFront URL
- Extracts key from S3 direct URL
- Returns null for non-S3 URLs
- Handles URLs with query parameters
- Handles URLs with fragments

**2.5** Test `isS3Configured()`
- Returns true when env vars are set
- Returns false when env vars are missing
- Mock process.env appropriately

**2.6** Mock S3 client for upload/delete/exists tests
- Mock `S3Client.send()` method
- Verify correct commands are created
- Verify correct parameters passed

**2.7** Test error handling
- Upload fails when S3 not configured
- Delete handles not found gracefully
- FileExists handles errors correctly

**Deliverables**:
- ✅ Comprehensive unit test suite
- ✅ All edge cases covered
- ✅ Mocked S3 client (no real AWS calls)

---

## Phase 3: Upload Service Integration

**Goal**: Update existing upload service to support S3

### Tasks:

**3.1** Update `lib/api/services/upload.ts` - Add S3 support to `UploadOptions`
- Add `s3PathSegments?: string[]` option
- Keep all existing options intact

**3.2** Update `processFile()` function - Add S3 detection logic
- Detect S3 usage: `isS3Configured() && s3PathSegments && s3PathSegments.length > 0`
- If S3 disabled or no path segments → use existing local filesystem logic
- No changes to existing local logic (backward compatible)

**3.3** Implement S3 upload path in `processFile()`
- Convert File to Buffer
- Optimize image with Sharp (if `optimizeImages` option enabled)
- Generate S3 key using `generateS3Key(s3PathSegments, fileName)`
- Upload optimized buffer to S3 via `uploadToS3()`
- Return `ProcessedFile` with CloudFront URL

**3.4** Implement thumbnail generation for S3
- Generate thumbnail buffer with Sharp (if `generateThumbnails` enabled)
- Create thumbnail path segments: `[...s3PathSegments, 'thumbnails']`
- Generate thumbnail S3 key
- Upload thumbnail to S3
- Return thumbnail CloudFront URL

**3.5** Update `ProcessedFile` interface (if needed)
- Ensure `filePath` can store S3 key (not just local path)
- Ensure `fileUrl` returns CloudFront URL for S3
- Ensure `thumbnail` returns CloudFront URL for thumbnails

**3.6** Update upload service logging
- Log when S3 is used vs local filesystem
- Log S3 key and CloudFront URL
- Log thumbnail uploads separately

**3.7** Keep existing `deleteFile()` function
- Add S3 deletion support
- Detect if path is S3 key or local path
- Call `deleteFromS3()` for S3 keys
- Keep existing local file deletion logic

**Deliverables**:
- ✅ Upload service supports S3 with auto-detection
- ✅ Falls back to local filesystem if S3 not configured
- ✅ Thumbnails work with S3
- ✅ Backward compatible with existing code

---

## Phase 4: Upload API Route Integration

**Goal**: Update upload API to pass S3 path segments

### Tasks:

**4.1** Update `app/api/upload/route.ts` - Parse S3 path parameters
- Extract `practiceId`, `imageType`, `staffId` from form data (existing)
- Extract any other path-building parameters from form data

**4.2** Build S3 path segments dynamically
- If `practiceId` and `imageType` exist:
  - Build path: `['practices', practiceId, imageType]`
  - If `imageType === 'staff'` and `staffId` exists: append `staffId`
- For other asset types (future):
  - User avatar: `['users', userId, 'avatar']`
  - Organization logo: `['organizations', orgId, 'logo']`
  - etc.

**4.3** Pass S3 path segments to upload service
- Add `s3PathSegments` to `uploadFiles()` options
- Keep all existing options unchanged
- Service auto-detects S3 usage

**4.4** Update response handling
- Response already returns `fileUrl` - works for both local and S3
- Ensure database update uses CloudFront URL for S3 uploads
- Keep existing database update logic (via RBAC practice images service)

**4.5** Update API logging
- Log S3 path segments when provided
- Log whether S3 or local storage was used
- Keep existing comprehensive logging

**Deliverables**:
- ✅ API route builds S3 paths dynamically
- ✅ No hardcoded asset types or paths
- ✅ Works with existing database update logic
- ✅ Backward compatible

---

## Phase 5: Integration Tests

**Goal**: Test end-to-end upload flow with mocked S3

### Tasks:

**5.1** Create `tests/integration/api/upload-s3.test.ts`

**5.2** Test upload with S3 enabled
- Mock S3 client
- Mock `isS3Configured()` to return true
- Upload file with `s3PathSegments`
- Verify S3 upload was called with correct key
- Verify CloudFront URL returned
- Verify database updated with CloudFront URL

**5.3** Test upload with S3 disabled (fallback)
- Mock `isS3Configured()` to return false
- Upload file with `s3PathSegments`
- Verify local filesystem used
- Verify local URL returned (`/uploads/...`)

**5.4** Test thumbnail generation with S3
- Upload image with thumbnails enabled
- Verify main image uploaded to S3
- Verify thumbnail uploaded to S3 with correct path
- Verify both URLs returned

**5.5** Test practice image upload flow
- Upload logo for practice
- Verify S3 key format: `practices/{id}/logo/{file}.jpg`
- Verify database updated via RBAC service
- Verify CloudFront URL saved

**5.6** Test staff photo upload flow
- Upload staff photo
- Verify S3 key format: `practices/{practiceId}/staff/{staffId}/{file}.jpg`
- Verify database updated correctly

**5.7** Test error handling
- Upload fails when S3 credentials invalid
- Upload succeeds but database update fails
- Large file exceeds size limit
- Invalid file type rejected

**Deliverables**:
- ✅ Full integration test suite
- ✅ Mocked S3 client (no real AWS calls)
- ✅ All upload paths tested

---

## Phase 6: Environment Configuration

**Goal**: Document and configure environment variables

### Tasks:

**6.1** Update `.env.local` with S3 configuration
```bash
# S3 Public Assets Configuration
S3_PUBLIC_REGION=us-east-1
S3_PUBLIC_ACCESS_KEY_ID=your-key-here
S3_PUBLIC_SECRET_ACCESS_KEY=your-secret-here
S3_PUBLIC_BUCKET=bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058
CDN_URL=https://cdn.bendcare.com
```

**6.2** Update `.env.example` (if it exists)
- Add S3 configuration section
- Add placeholder values
- Add comments explaining each variable

**6.3** Update `.env.redis.template` or create `.env.s3.template`
- Template for S3-specific configuration
- Document required vs optional variables

**6.4** Document AWS credentials setup
- How to create IAM user with S3 permissions
- Minimum required permissions
- How to generate access keys
- Security best practices

**6.5** Update ECS task definition environment (staging/production)
- Add S3 environment variables to Secrets Manager
- Reference in ECS task definition
- Document deployment process

**6.6** Verify ECS task role has S3 permissions
- Check existing IAM role: `BCOS-ECSTaskRole`
- Verify permissions: `s3:PutObject`, `s3:DeleteObject` on bucket
- Update if needed (manually or document required changes)

**Deliverables**:
- ✅ Environment variables documented
- ✅ Local development configured
- ✅ Staging/production configuration documented
- ✅ IAM permissions verified

---

## Phase 7: Migration Script

**Goal**: Migrate existing `/public/uploads/*` files to S3

### Tasks:

**7.1** Create `scripts/migrate-uploads-to-s3.ts`

**7.2** Implement practice images migration
- Query all practices from database
- For each practice:
  - Check if `logo_url` starts with `/uploads/`
  - If yes: read file from disk, upload to S3, update DB
  - Check if `hero_image_url` starts with `/uploads/`
  - If yes: read file from disk, upload to S3, update DB
  - Parse `gallery_images` JSON array
  - For each gallery image starting with `/uploads/`: migrate to S3
- Use `generateS3Key()` to create proper S3 paths
- Update database with CloudFront URLs

**7.3** Implement staff photos migration
- Query all staff members with `photo_url`
- For each staff member:
  - Check if `photo_url` starts with `/uploads/`
  - If yes: read file from disk, upload to S3, update DB
- Use proper S3 path: `practices/{practiceId}/staff/{staffId}/{filename}`

**7.4** Add error handling and logging
- Log each file being migrated
- Log success/failure for each file
- Continue on errors (don't stop entire migration)
- Track statistics: total files, successful, failed
- Generate summary report at end

**7.5** Add dry-run mode
- Option to preview migration without making changes
- Show what would be migrated
- Show S3 keys that would be generated
- Show database updates that would be made

**7.6** Add file existence checks
- Check if local file exists before attempting upload
- Check if file already exists in S3 (skip if already migrated)
- Handle missing files gracefully

**7.7** Add database transaction handling
- Use transactions for database updates
- Rollback if upload succeeds but DB update fails
- Or: Mark as "needs cleanup" and provide cleanup script

**7.8** Create migration verification script
- `scripts/verify-s3-migration.ts`
- Check all practice images in database
- Verify CloudFront URLs are accessible (200 OK)
- Report any broken URLs
- Report any remaining `/uploads/*` URLs

**Deliverables**:
- ✅ Migration script with dry-run support
- ✅ Error handling and logging
- ✅ Verification script
- ✅ Migration documentation

---

## Phase 8: Testing in Development

**Goal**: Verify everything works locally before staging deployment

### Tasks:

**8.1** Run TypeScript compilation
- `pnpm tsc` - verify no type errors
- Fix any type errors discovered

**8.2** Run linting
- `pnpm lint` - verify code quality
- Fix any linting errors

**8.3** Run unit tests
- `pnpm test:unit` - verify all unit tests pass
- Verify S3 service tests pass
- Check test coverage

**8.4** Run integration tests
- `pnpm test:integration` - verify upload flow
- Verify S3 integration tests pass
- Check for any flaky tests

**8.5** Manual testing - local S3 uploads
- Configure `.env.local` with S3 credentials
- Upload practice logo via UI
- Verify file appears in S3 bucket
- Verify CloudFront URL works
- Verify database updated correctly

**8.6** Manual testing - local filesystem fallback
- Remove S3 credentials from `.env.local`
- Upload practice logo via UI
- Verify file saved to `/public/uploads/`
- Verify local URL works
- Verify database updated correctly

**8.7** Manual testing - thumbnails
- Upload image with thumbnails enabled
- Verify thumbnail generated in S3
- Verify thumbnail URL works
- Check thumbnail quality and dimensions

**8.8** Manual testing - practice website rendering
- Upload logo, hero, gallery images for test practice
- View practice website (e.g., `lakenorman.care` locally)
- Verify all images load from CloudFront
- Check browser network tab for CDN URLs
- Verify CSP doesn't block images

**8.9** Test migration script (dry-run)
- Run migration script with `--dry-run` flag
- Review what would be migrated
- Verify S3 key format is correct
- Check for any errors or warnings

**Deliverables**:
- ✅ All tests passing
- ✅ Local testing successful (both S3 and fallback)
- ✅ No regressions in existing functionality
- ✅ Ready for staging deployment

---

## Phase 9: Staging Deployment

**Goal**: Deploy to staging and verify in production-like environment

### Tasks:

**9.1** Update staging environment variables
- Add S3 credentials to staging Secrets Manager
- Add `CDN_URL=https://cdn.bendcare.com`
- Verify all required env vars are set

**9.2** Deploy code to staging
- Push code to staging branch
- Trigger deployment pipeline
- Monitor deployment logs
- Verify ECS service updated successfully

**9.3** Verify staging application health
- Check health endpoint: `/api/health`
- Verify application starts without errors
- Check CloudWatch logs for any errors

**9.4** Test uploads in staging
- Login to staging: `staging.bendcare.com`
- Upload test practice logo
- Verify file uploaded to S3
- Verify CloudFront URL returned
- Verify database updated

**9.5** Test practice website in staging
- Configure test practice domain (or use staging subdomain)
- View practice website with uploaded images
- Verify images load from CloudFront CDN
- Check page load speed
- Verify CSP headers allow CloudFront

**9.6** Run migration script in staging (dry-run)
- SSH into staging ECS task or run via AWS CLI
- Run migration script with `--dry-run`
- Review migration plan
- Check for any unexpected issues

**9.7** Run migration script in staging (real)
- Run migration without dry-run flag
- Monitor progress and logs
- Verify files uploaded to S3
- Verify database updated correctly
- Run verification script

**9.8** Verify migrated images in staging
- View multiple practice websites
- Verify all images load from CloudFront
- Check for any broken images
- Verify thumbnails work

**9.9** Load testing (optional)
- Upload multiple files concurrently
- Verify S3 handles load
- Check CloudWatch metrics for S3 and CloudFront
- Monitor for any rate limiting or errors

**Deliverables**:
- ✅ Staging deployment successful
- ✅ Uploads working via S3
- ✅ Migration successful in staging
- ✅ No issues discovered
- ✅ Ready for production

---

## Phase 10: Production Deployment

**Goal**: Deploy to production with zero downtime

### Tasks:

**10.1** Pre-deployment checklist
- ✅ All staging tests passed
- ✅ Migration script tested in staging
- ✅ Verification script ready
- ✅ Rollback plan documented
- ✅ Monitoring dashboards prepared
- ✅ Team notified of deployment

**10.2** Update production environment variables
- Add S3 credentials to production Secrets Manager
- Add `CDN_URL=https://cdn.bendcare.com`
- Verify all required env vars are set
- Double-check credentials are correct

**10.3** Deploy code to production
- Push code to main branch
- Trigger production deployment pipeline
- Monitor deployment closely
- Verify ECS service updates without downtime

**10.4** Verify production application health
- Check health endpoint: `/api/health`
- Verify no errors in CloudWatch logs
- Monitor error rates in CloudWatch metrics
- Check ALB target health

**10.5** Test uploads in production (small scale)
- Upload single test image for one practice
- Verify S3 upload successful
- Verify CloudFront URL works
- Verify database updated
- Delete test image

**10.6** Run migration script (dry-run)
- Run in production with `--dry-run`
- Review migration plan for all practices
- Estimate total time required
- Check for any issues

**10.7** Schedule migration window
- Choose low-traffic time (e.g., 2am-4am)
- Notify team of maintenance window
- Prepare rollback plan
- Have team on standby

**10.8** Run migration script in production
- Execute migration during scheduled window
- Monitor progress in real-time
- Watch CloudWatch logs for errors
- Track upload success/failure rates
- Be ready to abort if issues arise

**10.9** Run verification script
- Verify all migrated images accessible
- Check for any 404s or 403s
- Verify database URLs are correct
- Generate verification report

**10.10** Monitor production post-migration
- Watch CloudWatch metrics for 24 hours
- Monitor error rates for image loading
- Check practice websites for broken images
- Monitor S3 and CloudFront metrics
- Check for any user reports of issues

**10.11** Post-deployment validation
- Spot-check multiple practice websites
- Verify images load quickly
- Check CDN cache hit rates
- Verify no performance degradation
- Confirm zero downtime achieved

**Deliverables**:
- ✅ Production deployment successful
- ✅ Migration completed successfully
- ✅ All images accessible via CloudFront
- ✅ Zero downtime
- ✅ No critical issues

---

## Phase 11: Cleanup and Documentation

**Goal**: Clean up old files and document the new system

### Tasks:

**11.1** Wait period before cleanup
- Wait 30 days after migration
- Monitor for any issues with S3 images
- Ensure no rollback needed
- Verify all images accessible

**11.2** Archive `/public/uploads/` directory
- Create tarball of entire uploads directory
- Store in S3 (private bucket) as backup
- Document archive location
- Set lifecycle policy for archive (delete after 1 year)

**11.3** Delete local `/public/uploads/` files
- Remove files from production ECS containers
- Remove from staging
- Keep `.gitkeep` if directory structure needed
- Document deletion date

**11.4** Update documentation - Architecture docs
- Document S3 + CloudFront architecture
- Document bucket structure and naming conventions
- Document CDN URLs and configuration
- Add architecture diagrams

**11.5** Update documentation - Developer guide
- Document how to use `lib/s3/public-assets.ts`
- Provide code examples for common use cases
- Document environment variables required
- Document local development setup

**11.6** Update documentation - Operations guide
- Document CloudFront setup process
- Document how to add new asset types
- Document monitoring and troubleshooting
- Document backup and disaster recovery

**11.7** Update CLAUDE.md (this file)
- Add S3 public assets section
- Document usage patterns
- Document security requirements
- Reference new documentation

**11.8** Create runbook for common operations
- How to invalidate CloudFront cache
- How to troubleshoot broken images
- How to add new asset types
- How to monitor S3 costs

**11.9** Update onboarding documentation
- Add S3 setup to new developer guide
- Document AWS credentials setup
- Document how to test locally with S3
- Document troubleshooting steps

**11.10** Code cleanup
- Remove any dead code or commented code
- Remove temporary logging if added
- Clean up any migration-specific code
- Final linting and formatting pass

**Deliverables**:
- ✅ Old files archived and deleted
- ✅ Complete documentation
- ✅ Runbooks created
- ✅ Code cleaned up
- ✅ Team trained

---

## Phase 12: Monitoring and Optimization

**Goal**: Set up monitoring and optimize performance

### Tasks:

**12.1** Create CloudWatch dashboards
- S3 upload success/failure rates
- S3 upload duration (P50, P95, P99)
- CloudFront cache hit rate
- CloudFront 4xx/5xx error rates
- S3 storage used (total GB)
- CloudFront bandwidth (total GB transferred)

**12.2** Create CloudWatch alarms
- Alert on S3 upload failure rate > 5%
- Alert on S3 upload duration > 5 seconds (P95)
- Alert on CloudFront error rate > 1%
- Alert on CloudFront origin errors
- Send alerts to appropriate channels

**12.3** Analyze CloudFront cache performance
- Check cache hit rate (should be > 90%)
- Identify frequently requested files
- Optimize cache-control headers if needed
- Consider cache invalidation strategies

**12.4** Analyze S3 costs
- Review S3 storage costs
- Review S3 request costs (PUT, GET)
- Review CloudFront costs
- Identify optimization opportunities

**12.5** Optimize image sizes (if needed)
- Analyze image sizes in S3
- Identify large images (> 1MB)
- Adjust Sharp compression settings if needed
- Consider WebP conversion for better compression

**12.6** Set up S3 lifecycle policies (optional)
- Auto-delete thumbnails after X days if unused
- Move old images to Glacier for archival
- Document lifecycle policy decisions

**12.7** Configure S3 versioning (optional)
- Enable versioning for recovery from accidental deletes
- Document versioning policy
- Set up lifecycle to delete old versions after X days

**12.8** Performance testing
- Test image load times from various regions
- Verify CloudFront edge locations being used
- Measure page load impact on practice websites
- Compare before/after performance

**12.9** Security audit
- Verify S3 bucket is private (no public access)
- Verify only CloudFront OAI can read
- Verify ECS task role permissions are minimal
- Check for any exposed credentials in logs

**12.10** Cost optimization review
- Evaluate CloudFront price class (use fewer regions?)
- Evaluate S3 storage class (standard vs intelligent tiering)
- Review data transfer costs
- Project future costs based on usage

**Deliverables**:
- ✅ Monitoring dashboards operational
- ✅ Alerts configured
- ✅ Performance optimized
- ✅ Costs under control
- ✅ Security verified

---

## Success Criteria

### Phase 0 (Infrastructure)
- ✅ CloudFront distribution operational at `cdn.bendcare.com`
- ✅ S3 bucket private, accessible only via CloudFront OAI
- ✅ Test file accessible via CloudFront, blocked via S3 direct URL

### Phase 1-2 (Service + Tests)
- ✅ Generic S3 service created with full TypeScript typing
- ✅ All unit tests passing (100% coverage of core functions)
- ✅ Service works for any asset type (no hardcoded paths)

### Phase 3-5 (Integration)
- ✅ Upload service supports S3 with auto-detection
- ✅ Falls back to local filesystem if S3 not configured
- ✅ All integration tests passing
- ✅ No regressions in existing functionality

### Phase 6-8 (Development)
- ✅ Environment configured correctly
- ✅ Local testing successful (S3 and fallback modes)
- ✅ All TypeScript/linting checks passing
- ✅ Practice websites load images from CloudFront

### Phase 9 (Staging)
- ✅ Staging deployment successful
- ✅ Uploads work via S3 in staging
- ✅ Migration script tested and verified
- ✅ No critical issues found

### Phase 10 (Production)
- ✅ Production deployment with zero downtime
- ✅ All images migrated to S3 successfully
- ✅ All practice websites load images from CloudFront
- ✅ No increase in error rates

### Phase 11-12 (Cleanup & Monitoring)
- ✅ Old files archived and deleted
- ✅ Documentation complete
- ✅ Monitoring operational
- ✅ Team trained

---

## Risk Mitigation

### Risk: CloudFront deployment takes 15-20 minutes
**Mitigation**: Create CloudFront distribution first (Phase 0), proceed with code development during deployment

### Risk: Migration script fails partway through
**Mitigation**:
- Dry-run mode to preview
- Continue on errors (don't stop)
- Track progress (can resume)
- Verification script to find issues

### Risk: S3 upload fails in production
**Mitigation**:
- Automatic fallback to local filesystem
- Comprehensive error logging
- Alerts on high failure rates
- Rollback plan ready

### Risk: CloudFront URLs break existing practice websites
**Mitigation**:
- Test in staging first
- Gradual rollout (migrate one practice, verify, continue)
- Keep old URLs working during transition
- Can rollback database URLs if needed

### Risk: S3 costs spike unexpectedly
**Mitigation**:
- Cost estimation done upfront (~$0.50/month)
- CloudWatch metrics track storage and bandwidth
- Alerts on unusual usage patterns
- Can disable S3 uploads if needed (fallback to local)

### Risk: CSP headers block CloudFront images
**Mitigation**:
- Update CSP to allow `cdn.bendcare.com`
- Test in staging first
- Verify in browser console
- Have CSP update ready to deploy

---

## Rollback Plan

### If issues discovered in staging:
1. Fix issues before production deployment
2. No rollback needed (staging is for testing)

### If issues discovered immediately after production deployment:
1. Remove S3 credentials from environment → automatic fallback to local
2. Verify uploads work locally
3. Fix issues, redeploy

### If issues discovered after migration:
1. Revert database URLs from CloudFront to `/uploads/*`
2. Restore `/public/uploads/` from archive
3. Remove S3 credentials → automatic fallback
4. Investigate and fix issues
5. Re-migrate when ready

---

## Timeline Estimate

- **Phase 0** (Infrastructure): 2-3 hours (includes CloudFront deployment wait time)
- **Phase 1-2** (Service + Tests): 3-4 hours
- **Phase 3-5** (Integration + Tests): 3-4 hours
- **Phase 6-8** (Development + Testing): 2-3 hours
- **Phase 9** (Staging): 2-3 hours (includes migration)
- **Phase 10** (Production): 3-4 hours (includes monitoring period)
- **Phase 11-12** (Cleanup + Monitoring): 2-3 hours

**Total: 17-24 hours of work** (spread across multiple days for proper testing and monitoring)

---

## Usage Examples

### Generic S3 Service API

```typescript
import { generateS3Key, uploadToS3, deleteFromS3, getPublicUrl } from '@/lib/s3/public-assets';

// Example 1: Practice logo
const s3Key = generateS3Key(['practices', practiceId, 'logo'], 'logo.jpg');
const result = await uploadToS3(buffer, s3Key, { contentType: 'image/jpeg' });
// result.fileUrl => 'https://cdn.bendcare.com/practices/123/logo/logo_k3j2h4g5.jpg'

// Example 2: User avatar
const s3Key = generateS3Key(['users', userId, 'avatar'], 'photo.png');
const result = await uploadToS3(buffer, s3Key, { contentType: 'image/png' });

// Example 3: Organization branding
const s3Key = generateS3Key(['organizations', orgId, 'branding', 'hero'], 'banner.jpg');
const result = await uploadToS3(buffer, s3Key, { contentType: 'image/jpeg' });

// Example 4: Marketing materials
const s3Key = generateS3Key(['marketing', 'campaigns', campaignId], 'ad.jpg');
const result = await uploadToS3(buffer, s3Key, { contentType: 'image/jpeg' });

// Example 5: Static assets (no unique ID)
const s3Key = generateS3Key(['static', 'icons'], 'favicon.ico', { addUniqueId: false });
const result = await uploadToS3(buffer, s3Key, {
  contentType: 'image/x-icon',
  cacheControl: 'public, max-age=604800', // 1 week
});

// Delete file
await deleteFromS3('practices/123/logo/logo_k3j2h4g5.jpg');

// Get public URL
const url = getPublicUrl('practices/123/logo/logo_k3j2h4g5.jpg');
// => 'https://cdn.bendcare.com/practices/123/logo/logo_k3j2h4g5.jpg'
```

### Upload Service Integration

```typescript
import { uploadFiles } from '@/lib/api/services/upload';

// Practice logo upload
const result = await uploadFiles(files, {
  s3PathSegments: ['practices', practiceId, 'logo'],
  optimizeImages: true,
  generateThumbnails: true,
  allowedTypes: ['image/jpeg', 'image/png'],
  maxFileSize: 10 * 1024 * 1024,
});

// User avatar upload
const result = await uploadFiles(files, {
  s3PathSegments: ['users', userId, 'avatar'],
  optimizeImages: true,
  generateThumbnails: false,
  allowedTypes: ['image/jpeg', 'image/png'],
  maxFileSize: 5 * 1024 * 1024,
});

// Marketing asset upload
const result = await uploadFiles(files, {
  s3PathSegments: ['marketing', 'banners', 'homepage'],
  optimizeImages: true,
  generateThumbnails: true,
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxFileSize: 10 * 1024 * 1024,
});
```

---

## Environment Variables

```bash
# Required for S3 uploads
S3_PUBLIC_REGION=us-east-1
S3_PUBLIC_ACCESS_KEY_ID=your-access-key-here
S3_PUBLIC_SECRET_ACCESS_KEY=your-secret-key-here
S3_PUBLIC_BUCKET=bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058
CDN_URL=https://cdn.bendcare.com

# Optional - defaults shown
# (none currently)
```

**Note**: If S3 credentials are not configured, the upload service automatically falls back to local filesystem storage in `/public/uploads/`.

---

## S3 Bucket Structure

```
bcos-public-2c2af3de-6771-4cf3-90ff-330d402c1058/
├── practices/
│   └── {practice_id}/
│       ├── logo/
│       │   ├── logo_{nanoid}.jpg
│       │   └── thumbnails/
│       │       └── logo_{nanoid}.jpg
│       ├── hero/
│       │   ├── hero_{nanoid}.jpg
│       │   └── thumbnails/
│       │       └── hero_{nanoid}.jpg
│       ├── gallery/
│       │   ├── image_{nanoid}_1.jpg
│       │   ├── image_{nanoid}_2.jpg
│       │   └── thumbnails/
│       │       ├── image_{nanoid}_1.jpg
│       │       └── image_{nanoid}_2.jpg
│       └── staff/
│           └── {staff_id}/
│               ├── photo_{nanoid}.jpg
│               └── thumbnails/
│                   └── photo_{nanoid}.jpg
├── users/
│   └── {user_id}/
│       └── avatar/
│           ├── avatar_{nanoid}.jpg
│           └── thumbnails/
│               └── avatar_{nanoid}.jpg
├── organizations/
│   └── {org_id}/
│       └── logo/
│           ├── logo_{nanoid}.jpg
│           └── thumbnails/
│               └── logo_{nanoid}.jpg
└── marketing/
    └── campaigns/
        └── {campaign_id}/
            ├── banner_{nanoid}.jpg
            └── thumbnails/
                └── banner_{nanoid}.jpg
```

---

## Cost Estimation

### S3 Storage
- Assume 100 practices × 10 images each × 500KB avg = **500MB**
- S3 Standard: $0.023/GB/month = **$0.01/month** (negligible)

### Data Transfer (CloudFront)
- 10,000 image requests/month × 500KB avg = **5GB**
- CloudFront: $0.085/GB = **$0.43/month**

### Requests
- 10,000 GET requests = **$0.004/month**
- 100 PUT requests = **$0.0005/month**

**Total: ~$0.45/month** (scales linearly with traffic)

---

## Next Steps

1. Review this plan and approve
2. Begin Phase 0: CloudFront infrastructure setup
3. Proceed through phases sequentially
4. Test thoroughly at each phase before proceeding
5. Deploy to staging before production
6. Monitor closely post-deployment
