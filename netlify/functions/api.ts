import type { Handler, HandlerEvent } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";
import { z } from "zod";

type Role = "admin" | "creator" | "participant";

type JsonEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
  meta?: Record<string, unknown>;
};

type AuthedContext = {
  userId: string;
  email?: string;
  role: Role;
  orgId: string;
  token: JWTPayload;
};

const env = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  azureIssuer: process.env.AZURE_ISSUER,
  azureAudience: process.env.AZURE_AUDIENCE,
  azureJwks: process.env.AZURE_JWKS_URI,
  defaultOrgId: process.env.DEFAULT_ORG_ID || "default-org",
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 100),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000)
};

const supabase = env.supabaseUrl && env.supabaseKey
  ? createClient(env.supabaseUrl, env.supabaseKey)
  : null;

const jwks = env.azureJwks ? createRemoteJWKSet(new URL(env.azureJwks)) : null;
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const json = <T>(statusCode: number, body: JsonEnvelope<T>) => ({
  statusCode,
  headers: {
    "content-type": "application/json",
    "cache-control": "no-store"
  },
  body: JSON.stringify(body)
});

const getBearerToken = (event: HandlerEvent): string | null => {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
};

const parseRole = (roles: unknown): Role => {
  const roleList = Array.isArray(roles) ? roles : [];
  if (roleList.includes("admin")) return "admin";
  if (roleList.includes("creator")) return "creator";
  return "participant";
};

const verifyToken = async (event: HandlerEvent): Promise<AuthedContext> => {
  const token = getBearerToken(event);
  if (!token || !jwks || !env.azureIssuer || !env.azureAudience) {
    throw new Error("Missing authorization configuration");
  }

  const { payload } = await jwtVerify(token, jwks, {
    issuer: env.azureIssuer,
    audience: env.azureAudience
  });

  const userId = String(payload.sub || "");
  if (!userId) throw new Error("Invalid token subject");

  const orgId = String(payload.org_id || payload.tid || env.defaultOrgId);

  return {
    userId,
    email: typeof payload.preferred_username === "string" ? payload.preferred_username : undefined,
    role: parseRole(payload.roles),
    orgId,
    token: payload
  };
};

const requireRole = (ctx: AuthedContext, allowed: Role[]) => {
  if (!allowed.includes(ctx.role)) {
    throw new Error("Insufficient role");
  }
};

const getOrgScope = (ctx: AuthedContext, requestedOrgId?: string): string => {
  return requestedOrgId && requestedOrgId === ctx.orgId ? requestedOrgId : ctx.orgId;
};

const rateLimit = (event: HandlerEvent) => {
  const key = event.headers["x-forwarded-for"] || "local";
  const now = Date.now();
  const item = rateLimitStore.get(key);

  if (!item || now > item.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + env.rateLimitWindowMs });
    return;
  }

  if (item.count >= env.rateLimitMax) {
    throw new Error("Rate limit exceeded");
  }

  item.count += 1;
  rateLimitStore.set(key, item);
};

const auditLog = (eventName: string, details: Record<string, unknown>) => {
  console.info(JSON.stringify({ eventName, details, at: new Date().toISOString() }));
};

const upsertRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["admin", "creator", "participant"])
});

const entitySchema = z.object({
  id: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  organization: z.string().min(1),
  role: z.string().min(1),
  internalContact: z.string().optional(),
  referredBy: z.string().optional(),
  contactType: z.enum(["Advisor", "Client", "Funder", "Partner"]),
  status: z.enum(["Active", "Prospect"])
});

const parseBody = (event: HandlerEvent) => {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON body");
  }
};

const handleAction = async (event: HandlerEvent, ctx: AuthedContext, action: string) => {
  switch (action) {
    case "me":
      return json(200, {
        ok: true,
        data: {
          id: ctx.userId,
          email: ctx.email,
          role: ctx.role,
          orgId: ctx.orgId
        }
      });

    case "users/list":
      requireRole(ctx, ["admin"]);
      return json(200, {
        ok: true,
        data: [{ id: "placeholder-user", role: "participant", orgId: ctx.orgId }],
        meta: { placeholder: true }
      });

    case "users/update-role": {
      requireRole(ctx, ["admin"]);
      const payload = upsertRoleSchema.parse(parseBody(event));
      auditLog("users.updateRole", { actor: ctx.userId, target: payload.userId, role: payload.role });
      return json(200, { ok: true, data: { ...payload, updated: true }, meta: { placeholder: true } });
    }

    case "entities/list":
      requireRole(ctx, ["admin", "creator", "participant"]);
      return json(200, {
        ok: true,
        data: [{ id: "contact-1", orgId: ctx.orgId, firstName: "Placeholder", lastName: "Contact" }],
        meta: { placeholder: true, orgId: getOrgScope(ctx) }
      });

    case "entities/get":
      requireRole(ctx, ["admin", "creator", "participant"]);
      return json(200, {
        ok: true,
        data: {
          id: event.queryStringParameters?.id || "contact-1",
          orgId: getOrgScope(ctx),
          firstName: "Placeholder",
          lastName: "Contact"
        },
        meta: { placeholder: true }
      });

    case "entities/create": {
      requireRole(ctx, ["admin", "creator"]);
      const payload = entitySchema.parse(parseBody(event));
      auditLog("entities.create", { actor: ctx.userId, orgId: ctx.orgId, name: `${payload.firstName} ${payload.lastName}` });
      return json(201, {
        ok: true,
        data: { ...payload, id: "new-contact-id", orgId: getOrgScope(ctx) },
        meta: { placeholder: true }
      });
    }

    case "entities/update": {
      requireRole(ctx, ["admin", "creator"]);
      const payload = entitySchema.extend({ id: z.string().min(1) }).parse(parseBody(event));
      auditLog("entities.update", { actor: ctx.userId, orgId: ctx.orgId, id: payload.id });
      return json(200, { ok: true, data: payload, meta: { placeholder: true } });
    }

    case "entities/delete":
      requireRole(ctx, ["admin", "creator"]);
      auditLog("entities.delete", { actor: ctx.userId, id: event.queryStringParameters?.id || "unknown" });
      return json(200, { ok: true, data: { deleted: true }, meta: { placeholder: true } });

    case "csv/export":
      requireRole(ctx, ["admin", "creator"]);
      return json(200, {
        ok: true,
        data: {
          message: "CSV export placeholder",
          url: "/exports/placeholder.csv"
        },
        meta: { placeholder: true }
      });

    default:
      return json(404, { ok: false, error: { code: "NOT_FOUND", message: `Unknown action: ${action}` } });
  }
};

export const handler: Handler = async (event) => {
  try {
    rateLimit(event);

    if (!supabase) {
      return json(500, {
        ok: false,
        error: { code: "CONFIG_ERROR", message: "Supabase is not configured" }
      });
    }

    const action = event.queryStringParameters?.action;
    if (!action) {
      return json(400, { ok: false, error: { code: "BAD_REQUEST", message: "Missing action parameter" } });
    }

    const authCtx = await verifyToken(event);
    const response = await handleAction(event, authCtx, action);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const code = message === "Insufficient role" ? "FORBIDDEN"
      : message === "Rate limit exceeded" ? "RATE_LIMITED"
      : "UNAUTHORIZED";

    return json(code === "FORBIDDEN" ? 403 : code === "RATE_LIMITED" ? 429 : 401, {
      ok: false,
      error: { code, message }
    });
  }
};
