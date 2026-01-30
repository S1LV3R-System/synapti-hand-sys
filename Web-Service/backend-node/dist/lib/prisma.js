"use strict";
/**
 * Shared Prisma Client with Schema Compatibility Stubs
 *
 * This module exports a Prisma client extended with stub implementations
 * for models that were removed in the Supabase schema migration.
 *
 * Usage: Import prisma from '@/lib/prisma' instead of creating new PrismaClient()
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.basePrisma = void 0;
const client_1 = require("@prisma/client");
const schema_compat_1 = require("../utils/schema-compat");
// Create the base Prisma client
const basePrisma = new client_1.PrismaClient();
exports.basePrisma = basePrisma;
// Extend with stubs for removed models
const prisma = (0, schema_compat_1.extendPrismaWithStubs)(basePrisma);
exports.default = prisma;
