/**
 * Shared Prisma Client with Schema Compatibility Stubs
 *
 * This module exports a Prisma client extended with stub implementations
 * for models that were removed in the Supabase schema migration.
 *
 * Usage: Import prisma from '@/lib/prisma' instead of creating new PrismaClient()
 */

import { PrismaClient } from '@prisma/client';
import { extendPrismaWithStubs } from '../utils/schema-compat';

// Create the base Prisma client
const basePrisma = new PrismaClient();

// Extend with stubs for removed models
const prisma = extendPrismaWithStubs(basePrisma) as PrismaClient & {
  clinicalAnalysis: any;
  signalProcessingResult: any;
  lSTMEventDetection: any;
  adminNote: any;
  projectMember: any;
  apiKey: any;
  session: any;
};

export default prisma;
export { basePrisma };
