# Phase 2 Database Deployment Instructions

To apply the database schema (16 tables + RLS + Edge Functions deployment), you will need to use the Supabase CLI in your local terminal (since this environment does not currently host your live Supabase instance).

\`\`\`bash
# 1. Initialize Supabase in your backend
npx supabase init

# 2. Push the schema from supabase/migrations/001_initial_schema.sql
npx supabase db push

# 3. Deploy Edge Functions without verifying JWT across the board (since some are public endpoints like bootstrap)
npx supabase functions deploy --no-verify-jwt

# 4. Set required secrets for Edge Functions
npx supabase secrets set DAILY_API_KEY=xxx JWT_SECRET=your-super-long-secret BCRYPT_ROUNDS=12 APP_URL=https://your-frontend-url.com
\`\`\`
