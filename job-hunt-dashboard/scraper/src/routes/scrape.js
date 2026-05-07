import { z } from 'zod';
import { searchIndeed, fetchIndeedListing, fetchIndeedJobDetails } from '../scrapers/indeed.js';
import { searchIndeedNl, fetchIndeedNlListing, fetchIndeedNlJobDetails } from '../scrapers/indeed_nl.js';
import { searchLinkedIn, fetchLinkedInListing, fetchLinkedInJobDetails } from '../scrapers/linkedin.js';
import { searchArc } from '../scrapers/arc.js';

const SearchSchema = z.object({
  source: z.enum(['indeed', 'indeed_nl', 'linkedin', 'arc']),
  query: z.string().min(1),
  location: z.string().optional(),
  maxResults: z.number().int().min(1).max(50).optional().default(25),
  storageStatePath: z.string().optional(),
});

const ListingSchema = z.object({
  source: z.enum(['indeed', 'indeed_nl', 'linkedin']),
  url: z.string().url(),
  storageStatePath: z.string().optional(),
});

const JobDetailsSchema = z.object({
  source: z.enum(['linkedin', 'indeed', 'indeed_nl']),
  url: z.string().url(),
  storageStatePath: z.string().optional(),
});

export async function scrapeRoutes(fastify) {
  fastify.post('/scrape/search', async (request, reply) => {
    const body = SearchSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send(body.error);

    const { source, query, location, maxResults, storageStatePath } = body.data;
    const scrapers = { indeed: searchIndeed, indeed_nl: searchIndeedNl, linkedin: searchLinkedIn, arc: searchArc };
    const results = await scrapers[source]({ query, location, maxResults, storageStatePath });
    return { source, query, results, scrapedAt: new Date().toISOString() };
  });

  fastify.post('/scrape/listing', async (request, reply) => {
    const body = ListingSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send(body.error);

    const { source, url, storageStatePath } = body.data;
    const fetchers = { indeed: fetchIndeedListing, indeed_nl: fetchIndeedNlListing, linkedin: fetchLinkedInListing };
    const description = await fetchers[source](url, storageStatePath);
    return { source, url, description, extractedAt: new Date().toISOString() };
  });

  fastify.post('/scrape/job-details', async (request, reply) => {
    const body = JobDetailsSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send(body.error);

    const { source, url, storageStatePath } = body.data;
    const fetchers = {
      linkedin: fetchLinkedInJobDetails,
      indeed: fetchIndeedJobDetails,
      indeed_nl: fetchIndeedNlJobDetails,
    };
    const result = await fetchers[source](url, storageStatePath);
    return { source, url, ...result, extractedAt: new Date().toISOString() };
  });
}
