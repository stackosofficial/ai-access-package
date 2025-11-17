import { Request, Response, NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { createDrizzleClient, apiKeys, organisations } from "../database/drizzleClient";
import { Pool } from "pg";

declare module "express-serve-static-core" {
  interface Request {
    organisationId?: string;
    apiKeyId?: string;
  }
}

export function createApiKeyAuthMiddleware(pool: Pool) {
  const db = createDrizzleClient(pool);

  return async function apiKeyAuth(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const apiKeyHeader = req.header("x-api-key");

      if (!apiKeyHeader) {
        return res.status(401).json({
          success: false,
          error: "Missing x-api-key header",
        });
      }

      // Look up API key and organisation
      const rows = await db
        .select({
          apiKeyId: apiKeys.id,
          organisationId: apiKeys.organisationId,
          isActive: apiKeys.isActive,
          revokedAt: apiKeys.revokedAt,
        })
        .from(apiKeys)
        .innerJoin(
          organisations,
          eq(apiKeys.organisationId, organisations.id)
        )
        .where(
          and(
            eq(apiKeys.apiKey, apiKeyHeader),
            eq(apiKeys.isActive, true)
          )
        )
        .limit(1);

      const record = rows[0];

      if (!record || record.revokedAt) {
        return res.status(401).json({
          success: false,
          error: "Invalid or inactive API key",
        });
      }

      // Attach organisation and apiKey to the request context
      req.organisationId = record.organisationId;
      req.apiKeyId = record.apiKeyId;

      next();
    } catch (error: any) {
      console.error("❌ Error in API key auth middleware:", error);
      return res.status(500).json({
        success: false,
        error: "Internal server error during API key validation",
      });
    }
  };
}


