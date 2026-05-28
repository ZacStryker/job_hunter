import { pipeline } from '@xenova/transformers'
const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
const result = await extractor('Software Engineer', { pooling: 'mean', normalize: true })
const vec: number[] = Array.from(result.data as Float32Array)
console.log(`OK — length=${vec.length} sample=${JSON.stringify(vec.slice(0, 3))}`)
