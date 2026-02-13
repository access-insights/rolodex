import type { Handler, HandlerEvent } from "@netlify/functions";
import { Pool, PoolClient } from "pg";
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

type DbUser = {
  id: string;
  organization_id: string;
  subject: string;
  email: string | null;
  display_name: string | null;
  role: Role;
};

type DbContact = {
  unique_id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  organization: string | null;
  role: string | null;
  internal_contact: string | null;
  referred_by: string | null;
  contact_type: "Advisor" | "Client" | "Funder" | "Partner";
  status: "Active" | "Prospect";
};

const env = {
  supabaseDbUrl: process.env.SUPABASE_DB_URL,
  azureIssuer: process.env.AZURE_ISSUER,
  azureAudience: process.env.AZURE_AUDIENCE,
  azureJwks: process.env.AZURE_JWKS_URI,
  defaultOrgId: process.env.DEFAULT_ORG_ID || "",
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 100),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000)
};

const jwks = env.azureJwks ? createRemoteJWKSet(new URL(env.azureJwks)) : null;
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const pool = env.supabaseDbUrl
  ? new Pool({
      connectionString: env.supabaseDbUrl,
      ssl: { rejectUnauthorized: false }
    })
  : null;

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

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

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

  const orgClaim = String(payload.org_id || payload.tid || env.defaultOrgId || "");
  if (!orgClaim || !isUuid(orgClaim)) {
    throw new Error("Invalid organization context");
  }

  return {
    userId,
    email: typeof payload.preferred_username === "string" ? payload.preferred_username : undefined,
    role: parseRole(payload.roles),
    orgId: orgClaim,
    token: payload
  };
};

const requireRole = (ctx: AuthedContext, allowed: Role[]) => {
  if (!allowed.includes(ctx.role)) {
    throw new Error("Insufficient role");
  }
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

const parseBody = (event: HandlerEvent) => {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON body");
  }
};

const upsertRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "creator", "participant"])
});

const entitySchema = z.object({
  id: z.string().uuid().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  organization: z.string().min(1),
  role: z.string().min(1),
  internalContact: z.string().optional(),
  referredBy: z.string().optional(),
  contactType: z.enum(["Advisor", "Client", "Funder", "Partner"]),
  status: z.enum(["Active", "Prospect"])
});

const mapContact = (contact: DbContact) => ({
  id: contact.unique_id,
  orgId: contact.organization_id,
  firstName: contact.first_name,
  lastName: contact.last_name,
  organization: contact.organization,
  role: contact.role,
  internalContact: contact.internal_contact,
  referredBy: contact.referred_by,
  contactType: contact.contact_type,
  status: contact.status
});

const withRlsContext = async <T>(ctx: AuthedContext, run: (client: PoolClient) => Promise<T>) => {
  if (!pool) {
    throw new Error("SUPABASE_DB_URL is required for strict RLS mode");
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `
      select
        set_config('app.current_sub', $1, true),
        set_config('app.current_role', $2, true),
        set_config('app.current_org_id', $3, true),
        set_config('request.jwt.claim.sub', $1, true),
        set_config('request.jwt.claim.role', $2, true),
        set_config('request.jwt.claim.org_id', $3, true)
      `,
      [ctx.userId, ctx.role, ctx.orgId]
    );

    const result = await run(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

const getActorUserId = async (client: PoolClient, ctx: AuthedContext): Promise<string | null> => {
  const actor = await client.query<{ id: string }>(
    `
    select id
    from users
    where subject = $1 and organization_id = $2
    limit 1
    `,
    [ctx.userId, ctx.orgId]
  );

  return actor.rows[0]?.id ?? null;
};

const writeAuditLog = async (
  client: PoolClient,
  ctx: AuthedContext,
  details: {
    action: string;
    entityType?: string;
    entityId?: string;
    ip?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }
) => {
  const actorUserId = await getActorUserId(client, ctx);

  await client.query(
    `
    insert into audit_log (
      organization_id,
      actor_user_id,
      actor_subject,
      action,
      entity_type,
      entity_id,
      ip,
      user_agent,
      metadata
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    `,
    [
      ctx.orgId,
      actorUserId,
      ctx.userId,
      details.action,
      details.entityType ?? null,
      details.entityId ?? null,
      details.ip ?? null,
      details.userAgent ?? null,
      JSON.stringify(details.metadata ?? {})
    ]
  );
};

const handleAction = async (event: HandlerEvent, ctx: AuthedContext, action: string) => {
  return withRlsContext(ctx, async (client) => {
    switch (action) {
      case "me": {
        const me = await client.query<DbUser>(
          `
          select id, organization_id, subject, email, display_name, role
          from users
          where subject = $1 and organization_id = $2
          limit 1
          `,
          [ctx.userId, ctx.orgId]
        );

        const row = me.rows[0];
        return json(200, {
          ok: true,
          data: row
            ? {
                id: row.id,
                subject: row.subject,
                email: row.email,
                displayName: row.display_name,
                role: row.role,
                orgId: row.organization_id,
                linkedUser: true
              }
            : {
                id: ctx.userId,
                subject: ctx.userId,
                email: ctx.email,
                role: ctx.role,
                orgId: ctx.orgId,
                linkedUser: false
              }
        });
      }

      case "users/list": {
        requireRole(ctx, ["admin"]);
        const users = await client.query<DbUser>(
          `
          select id, organization_id, subject, email, display_name, role
          from users
          where organization_id = $1
          order by created_at asc
          `,
          [ctx.orgId]
        );

        return json(200, {
          ok: true,
          data: users.rows.map((row) => ({
            id: row.id,
            orgId: row.organization_id,
            subject: row.subject,
            email: row.email,
            displayName: row.display_name,
            role: row.role
          }))
        });
      }

      case "users/update-role": {
        requireRole(ctx, ["admin"]);
        const payload = upsertRoleSchema.parse(parseBody(event));

        const updated = await client.query<{ id: string; role: Role }>(
          `
          update users
          set role = $1
          where id = $2 and organization_id = $3
          returning id, role
          `,
          [payload.role, payload.userId, ctx.orgId]
        );

        await writeAuditLog(client, ctx, {
          action: "users.update_role",
          entityType: "users",
          entityId: payload.userId,
          ip: event.headers["x-forwarded-for"] || "local",
          userAgent: event.headers["user-agent"] || "unknown",
          metadata: { role: payload.role }
        });

        return json(200, {
          ok: true,
          data: {
            id: payload.userId,
            role: payload.role,
            updated: (updated.rowCount ?? 0) > 0
          }
        });
      }

      case "entities/list": {
        requireRole(ctx, ["admin", "creator", "participant"]);
        const contacts = await client.query<DbContact>(
          `
          select unique_id, organization_id, first_name, last_name, organization, role,
                 internal_contact, referred_by, contact_type, status
          from contacts
          where organization_id = $1
          order by last_name asc, first_name asc
          limit 200
          `,
          [ctx.orgId]
        );

        return json(200, {
          ok: true,
          data: contacts.rows.map(mapContact),
          meta: { orgId: ctx.orgId }
        });
      }

      case "entities/get": {
        requireRole(ctx, ["admin", "creator", "participant"]);
        const id = event.queryStringParameters?.id;
        if (!id || !isUuid(id)) {
          return json(400, { ok: false, error: { code: "BAD_REQUEST", message: "Missing or invalid id" } });
        }

        const contact = await client.query<DbContact>(
          `
          select unique_id, organization_id, first_name, last_name, organization, role,
                 internal_contact, referred_by, contact_type, status
          from contacts
          where unique_id = $1 and organization_id = $2
          limit 1
          `,
          [id, ctx.orgId]
        );

        if (!contact.rows[0]) {
          return json(404, { ok: false, error: { code: "NOT_FOUND", message: "Contact not found" } });
        }

        return json(200, { ok: true, data: mapContact(contact.rows[0]) });
      }

      case "entities/create": {
        requireRole(ctx, ["admin", "creator"]);
        const payload = entitySchema.parse(parseBody(event));
        const actorUserId = await getActorUserId(client, ctx);

        const created = await client.query<DbContact>(
          `
          insert into contacts (
            organization_id,
            first_name,
            last_name,
            organization,
            role,
            internal_contact,
            referred_by,
            contact_type,
            status,
            created_by,
            updated_by
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8::contact_type_enum, $9::contact_status_enum, $10, $10)
          returning unique_id, organization_id, first_name, last_name, organization, role,
                    internal_contact, referred_by, contact_type, status
          `,
          [
            ctx.orgId,
            payload.firstName,
            payload.lastName,
            payload.organization,
            payload.role,
            payload.internalContact ?? null,
            payload.referredBy ?? null,
            payload.contactType,
            payload.status,
            actorUserId
          ]
        );

        const row = created.rows[0];
        await writeAuditLog(client, ctx, {
          action: "contacts.create",
          entityType: "contacts",
          entityId: row.unique_id,
          ip: event.headers["x-forwarded-for"] || "local",
          userAgent: event.headers["user-agent"] || "unknown"
        });

        return json(201, { ok: true, data: mapContact(row) });
      }

      case "entities/update": {
        requireRole(ctx, ["admin", "creator"]);
        const payload = entitySchema.extend({ id: z.string().uuid() }).parse(parseBody(event));
        const actorUserId = await getActorUserId(client, ctx);

        const updated = await client.query<DbContact>(
          `
          update contacts
          set
            first_name = $1,
            last_name = $2,
            organization = $3,
            role = $4,
            internal_contact = $5,
            referred_by = $6,
            contact_type = $7::contact_type_enum,
            status = $8::contact_status_enum,
            updated_by = $9
          where unique_id = $10 and organization_id = $11
          returning unique_id, organization_id, first_name, last_name, organization, role,
                    internal_contact, referred_by, contact_type, status
          `,
          [
            payload.firstName,
            payload.lastName,
            payload.organization,
            payload.role,
            payload.internalContact ?? null,
            payload.referredBy ?? null,
            payload.contactType,
            payload.status,
            actorUserId,
            payload.id,
            ctx.orgId
          ]
        );

        const row = updated.rows[0];
        if (!row) {
          return json(404, { ok: false, error: { code: "NOT_FOUND", message: "Contact not found" } });
        }

        await writeAuditLog(client, ctx, {
          action: "contacts.update",
          entityType: "contacts",
          entityId: payload.id,
          ip: event.headers["x-forwarded-for"] || "local",
          userAgent: event.headers["user-agent"] || "unknown"
        });

        return json(200, { ok: true, data: mapContact(row) });
      }

      case "entities/delete": {
        requireRole(ctx, ["admin"]);
        const id = event.queryStringParameters?.id;
        if (!id || !isUuid(id)) {
          return json(400, { ok: false, error: { code: "BAD_REQUEST", message: "Missing or invalid id" } });
        }

        const deleted = await client.query<{ unique_id: string }>(
          `
          delete from contacts
          where unique_id = $1 and organization_id = $2
          returning unique_id
          `,
          [id, ctx.orgId]
        );

        if (!deleted.rows[0]) {
          return json(404, { ok: false, error: { code: "NOT_FOUND", message: "Contact not found" } });
        }

        await writeAuditLog(client, ctx, {
          action: "contacts.delete",
          entityType: "contacts",
          entityId: id,
          ip: event.headers["x-forwarded-for"] || "local",
          userAgent: event.headers["user-agent"] || "unknown"
        });

        return json(200, { ok: true, data: { deleted: true } });
      }

      case "csv/export": {
        requireRole(ctx, ["admin", "creator"]);
        return json(200, {
          ok: true,
          data: {
            message: "CSV export placeholder",
            url: "/exports/placeholder.csv"
          },
          meta: { placeholder: true }
        });
      }

      default:
        return json(404, { ok: false, error: { code: "NOT_FOUND", message: `Unknown action: ${action}` } });
    }
  });
};

export const handler: Handler = async (event) => {
  try {
    rateLimit(event);

    const action = event.queryStringParameters?.action;
    if (!action) {
      return json(400, { ok: false, error: { code: "BAD_REQUEST", message: "Missing action parameter" } });
    }

    const authCtx = await verifyToken(event);
    return await handleAction(event, authCtx, action);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json(400, { ok: false, error: { code: "VALIDATION_ERROR", message: error.message } });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    const lower = message.toLowerCase();

    if (message === "Insufficient role") {
      return json(403, { ok: false, error: { code: "FORBIDDEN", message } });
    }

    if (message === "Rate limit exceeded") {
      return json(429, { ok: false, error: { code: "RATE_LIMITED", message } });
    }

    if (message.includes("SUPABASE_DB_URL")) {
      return json(500, { ok: false, error: { code: "CONFIG_ERROR", message } });
    }

    if (lower.includes("invalid token") || lower.includes("authorization") || lower.includes("issuer") || lower.includes("audience")) {
      return json(401, { ok: false, error: { code: "UNAUTHORIZED", message } });
    }

    return json(500, { ok: false, error: { code: "DATABASE_ERROR", message } });
  }
};
