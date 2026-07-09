import { env, pipeline, type FeatureExtractionPipeline } from '@xenova/transformers'

// @xenova v2 does not read TRANSFORMERS_CACHE; cacheDir must be set before the
// first pipeline() call. The production image bakes the model into this dir, so a
// hub fetch at runtime means the bake failed — fail loudly instead of downloading.
if (process.env.EMBEDDING_CACHE_DIR) env.cacheDir = process.env.EMBEDDING_CACHE_DIR
if (process.env.NODE_ENV === 'production') {
  // Without the baked cache dir, allowRemoteModels=false would look for the model in
  // node_modules and fail deep inside a request. Fail at boot, where it is diagnosable.
  if (!process.env.EMBEDDING_CACHE_DIR) {
    throw new Error('EMBEDDING_CACHE_DIR is required in production (set by Dockerfile.deps)')
  }
  env.allowRemoteModels = false
}

let _extractor: FeatureExtractionPipeline | null = null
let _loading: Promise<FeatureExtractionPipeline> | null = null

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!_extractor) {
    _loading ??= pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
    _extractor = await _loading
  }
  return _extractor
}

export async function embed(text: string): Promise<number[]> {
  const extractor = await getExtractor()
  const result = await extractor(text, { pooling: 'mean', normalize: true })
  return Array.from(result.data as Float32Array)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  // Vectors are already normalized (all-MiniLM-L6-v2 + normalize:true)
  // so cosine similarity = dot product
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}
