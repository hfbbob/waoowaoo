import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL
  const poolParams = 'connection_limit=10&pool_timeout=10'
  const datasourceUrl = url?.includes('?')
    ? `${url}&${poolParams}`
    : url
      ? `${url}?${poolParams}`
      : undefined

  return new PrismaClient({
    datasourceUrl,
    log: process.env.NODE_ENV === 'development'
      ? ['warn', 'error']
      : ['error'],
  })
}

export const prisma = globalForPrisma.prisma || createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

