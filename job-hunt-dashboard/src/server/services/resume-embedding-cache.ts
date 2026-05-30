import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { userEmbeddings } from '../../db/schema'
import { embed } from './embedding-service'

export async function getOrComputeResumeEmbedding(
  userId: number,
  resumeText: string,
  profileHash: string,
): Promise<number[]> {
  const cached = db.select().from(userEmbeddings).where(eq(userEmbeddings.userId, userId)).get()
  if (cached?.profileHash === profileHash) {
    return JSON.parse(cached.embedding) as number[]
  }
  const embedding = await embed(resumeText)
  const embeddingJson = JSON.stringify(embedding)
  db.insert(userEmbeddings)
    .values({ userId, embedding: embeddingJson, profileHash })
    .onConflictDoUpdate({
      target: [userEmbeddings.userId],
      set: { embedding: embeddingJson, profileHash },
    })
    .run()
  return embedding
}
