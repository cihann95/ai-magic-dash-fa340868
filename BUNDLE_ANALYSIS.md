# Bundle Analysis

## Chunk Size Comparison

| Chunk | Before (KB) | After (KB) | Change |
|-------|-------------|------------|--------|
| vendor-react | N/A | 340.90 | New chunk |
| vendor-supabase | N/A | 197.51 | New chunk |
| vendor-charts | 729.08 | 412.07 | -317.01 (-43%) |
| vendor-ui | N/A | 257.95 | New chunk |
| index (main) | 1,083.81 | 607.75 | -476.06 (-44%) |

## Gzip Size Comparison

| Chunk | Before (KB) | After (KB) | Change |
|-------|-------------|------------|--------|
| vendor-react | N/A | 104.40 | New chunk |
| vendor-supabase | N/A | 52.01 | New chunk |
| vendor-charts | 219.48 | 121.41 | -98.07 (-45%) |
| vendor-ui | N/A | 83.89 | New chunk |
| index (main) | 302.77 | 156.68 | -146.09 (-48%) |

## Notes
- react + react-dom separated into vendor-react (340.90 KB / 104.40 KB gzip)
- @supabase/supabase-js separated into vendor-supabase (197.51 KB / 52.01 KB gzip)
- recharts separated into vendor-charts (412.07 KB / 121.41 KB gzip) - reduced from 729.08 KB
- framer-motion + @radix-ui/* separated into vendor-ui (257.95 KB / 83.89 KB gzip)
- Main index chunk reduced from 1,083.81 KB to 607.75 KB (-44%)
- Total vendor chunks: 1,208.43 KB (vs previous single recharts chunk of 729.08 KB)
- Better caching: vendor chunks can be cached separately from app code