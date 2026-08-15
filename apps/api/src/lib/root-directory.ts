import type { PrismaClient } from '@prisma/client';

export const ROOT_DIRECTORY_ID = 'root';

export async function ensureRootDirectory(prisma: PrismaClient): Promise<void> {
  await prisma.directory.upsert({
    where: { id: ROOT_DIRECTORY_ID },
    create: {
      id: ROOT_DIRECTORY_ID,
      name: ROOT_DIRECTORY_ID,
      parentId: ROOT_DIRECTORY_ID,
    },
    update: {},
  });
}
