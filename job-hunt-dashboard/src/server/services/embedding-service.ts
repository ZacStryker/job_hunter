import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers'

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
