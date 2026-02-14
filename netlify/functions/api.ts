import type { Handler, HandlerEvent } from "@netlify/functions";
import { Pool, PoolClient } from "pg";
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";
import { z } from "zod";

type Role = "admin" | "creator" | "participant";
type ContactType = "Advisor" | "Funder" | "Partner" | "Client" | "General";
type ContactStatus = "Active" | "Prospect" | "Inactive" | "Archived";
type ContactAttribute =
  | "Academia"
  | "Accessible Education"
  | "Startup"
  | "Not for Profit"
  | "AgeTech"
  | "Robotics"
  | "AI Solutions"
  | "Consumer Products"
  | "Disability Services"
  | "Disability Community";

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
  referred_by_contact_id: string | null;
  contact_type: ContactType;
  status: ContactStatus;
  linkedin_profile_url: string | null;
  linkedin_picture_url: string | null;
  linkedin_company: string | null;
  linkedin_job_title: string | null;
  linkedin_location: string | null;
  attributes: ContactAttribute[];
  created_at: string;
  updated_at: string;
};

type DbContactMethod = {
  id: string;
  label: string | null;
  value: string;
  created_at: string;
};

type DbComment = {
  id: string;
  body: string;
  archived: boolean;
  deleted_at: string | null;
  created_at: string;
  author_name: string | null;
  author_email: string | null;
};

type DbLinkedInHistory = {
  id: string;
  snapshot: Record<string, unknown>;
  captured_at: string;
  created_at: string;
};

type ContactMethodInput = {
  label?: string;
  value: string;
};

type ContactUpsertInput = {
  id?: string;
  firstName: string;
  lastName: string;
  company?: string;
  role?: string;
  contactType: ContactType;
  status: ContactStatus;
  internalContact?: string;
  referredBy?: string;
  referredByContactId?: string;
  linkedInProfileUrl?: string;
  attributes?: ContactAttribute[];
  phones?: ContactMethodInput[];
  emails?: ContactMethodInput[];
  websites?: ContactMethodInput[];
};

const env = {
  supabaseDbUrl: process.env.SUPABASE_DB_URL,
  azureIssuer: process.env.AZURE_ISSUER,
  azureAudience: process.env.AZURE_AUDIENCE,
  azureClientId: process.env.AZURE_CLIENT_ID || process.env.VITE_AZURE_CLIENT_ID,
  azureJwks: process.env.AZURE_JWKS_URI,
  defaultOrgId: process.env.DEFAULT_ORG_ID || "",
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 100),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000)
};

const jwks = env.azureJwks ? createRemoteJWKSet(new URL(env.azureJwks)) : null;
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const normalizeDbUrl = (value: string) => {
  const parsed = new URL(value);
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("sslcert");
  parsed.searchParams.delete("sslkey");
  parsed.searchParams.delete("sslrootcert");
  return parsed.toString();
};
const pool = env.supabaseDbUrl
  ? new Pool({
      connectionString: normalizeDbUrl(env.supabaseDbUrl),
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
  const isDevBypass =
    process.env.NODE_ENV !== "production" &&
    (process.env.NETLIFY_DEV === "true" || process.env.ALLOW_DEV_AUTH === "true");

  if ((!jwks || !env.azureIssuer || !env.azureAudience) && isDevBypass) {
    if (!env.defaultOrgId || !isUuid(env.defaultOrgId)) {
      throw new Error("Invalid organization context");
    }

    return {
      userId: process.env.DEV_USER_SUB || "dev-local-sub",
      email: process.env.DEV_USER_EMAIL || "dev@example.com",
      role: parseRole([process.env.DEV_USER_ROLE || "participant"]),
      orgId: env.defaultOrgId,
      token: {}
    };
  }

  const token = getBearerToken(event);
  if (!token || !jwks || !env.azureIssuer || !env.azureAudience) {
    throw new Error("Missing authorization configuration");
  }

  const allowedAudiences = [
    ...(env.azureAudience ? env.azureAudience.split(",").map((value) => value.trim()).filter(Boolean) : []),
    ...(env.azureClientId ? [env.azureClientId.trim()] : [])
  ];

  const { payload } = await jwtVerify(token, jwks, {
    issuer: env.azureIssuer,
    audience: allowedAudiences.length > 0 ? allowedAudiences : undefined
  });

  const userId = String(payload.sub || "");
  if (!userId) throw new Error("Invalid token subject");

  const defaultOrg = env.defaultOrgId && isUuid(env.defaultOrgId) ? env.defaultOrgId : "";
  const payloadOrg = payload.org_id ? String(payload.org_id).trim() : "";
  const tenantOrg = payload.tid ? String(payload.tid).trim() : "";
  const orgClaim = defaultOrg || (isUuid(payloadOrg) ? payloadOrg : "") || (isUuid(tenantOrg) ? tenantOrg : "");
  if (!orgClaim) {
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

const methodEntrySchema = z.object({
  label: z.string().trim().max(120).optional(),
  value: z.string().trim().min(1).max(320)
});

const contactUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  company: z.string().trim().max(240).optional(),
  role: z.string().trim().max(240).optional(),
  internalContact: z.string().trim().max(240).optional(),
  referredBy: z.string().trim().max(240).optional(),
  referredByContactId: z.string().uuid().optional(),
  contactType: z.enum(["Advisor", "Funder", "Partner", "Client", "General"]),
  status: z.enum(["Active", "Prospect", "Inactive", "Archived"]),
  linkedInProfileUrl: z.string().trim().url().optional(),
  attributes: z
    .array(
      z.enum([
        "Academia",
        "Accessible Education",
        "Startup",
        "Not for Profit",
        "AgeTech",
        "Robotics",
        "AI Solutions",
        "Consumer Products",
        "Disability Services",
        "Disability Community"
      ])
    )
    .max(20)
    .optional(),
  phones: z.array(methodEntrySchema).max(25).optional(),
  emails: z.array(methodEntrySchema).max(25).optional(),
  websites: z.array(methodEntrySchema).max(25).optional()
});

const linkedInImportSchema = z.object({
  contactId: z.string().uuid().optional(),
  profileUrl: z.string().trim().url(),
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().min(1).max(120).optional(),
  company: z.string().trim().max(240).optional()
});

const csvImportSchema = z.object({
  csvContent: z.string().min(1).max(1_000_000)
});

const addCommentSchema = z.object({
  contactId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000)
});

const commentIdSchema = z.object({
  commentId: z.string().uuid()
});

const mapContactSummary = (contact: DbContact) => ({
  id: contact.unique_id,
  orgId: contact.organization_id,
  firstName: contact.first_name,
  lastName: contact.last_name,
  company: contact.organization,
  role: contact.role,
  internalContact: contact.internal_contact,
  referredBy: contact.referred_by,
  referredByContactId: contact.referred_by_contact_id,
  contactType: contact.contact_type,
  status: contact.status,
  linkedInProfileUrl: contact.linkedin_profile_url,
  linkedInPictureUrl: contact.linkedin_picture_url,
  linkedInCompany: contact.linkedin_company,
  linkedInJobTitle: contact.linkedin_job_title,
  linkedInLocation: contact.linkedin_location,
  attributes: contact.attributes ?? [],
  createdAt: contact.created_at,
  updatedAt: contact.updated_at
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

const loadContactSummary = async (client: PoolClient, orgId: string, id: string) => {
  const contact = await client.query<DbContact>(
    `
    select
      unique_id,
      organization_id,
      first_name,
      last_name,
      organization,
      role,
      internal_contact,
      referred_by,
      referred_by_contact_id,
      contact_type,
      status,
      linkedin_profile_url,
      linkedin_picture_url,
      linkedin_company,
      linkedin_job_title,
      linkedin_location,
      attributes,
      created_at,
      updated_at
    from contacts
    where unique_id = $1 and organization_id = $2
    limit 1
    `,
    [id, orgId]
  );

  return contact.rows[0] ?? null;
};

const loadContactDetail = async (client: PoolClient, orgId: string, id: string) => {
  const base = await loadContactSummary(client, orgId, id);
  if (!base) return null;

  const [phones, emails, websites, comments, referrals, referredByContact] = await Promise.all([
    client.query<DbContactMethod>(
      `
      select id, label, phone_number as value, created_at
      from contact_phone_numbers
      where organization_id = $1 and contact_id = $2
      order by created_at asc
      `,
      [orgId, id]
    ),
    client.query<DbContactMethod>(
      `
      select id, label, email as value, created_at
      from contact_emails
      where organization_id = $1 and contact_id = $2
      order by created_at asc
      `,
      [orgId, id]
    ),
    client.query<DbContactMethod>(
      `
      select id, label, url as value, created_at
      from contact_websites
      where organization_id = $1 and contact_id = $2
      order by created_at asc
      `,
      [orgId, id]
    ),
    client.query<DbComment>(
      `
      select
        c.id,
        c.body,
        c.archived,
        c.deleted_at,
        c.created_at,
        u.display_name as author_name,
        u.email as author_email
      from contact_comments c
      left join users u on u.id = c.created_by
      where c.organization_id = $1 and c.contact_id = $2 and c.deleted_at is null
      order by c.created_at desc
      `,
      [orgId, id]
    ),
    client.query<{ id: string; first_name: string; last_name: string }>(
      `
      select unique_id as id, first_name, last_name
      from contacts
      where organization_id = $1 and referred_by_contact_id = $2
      order by last_name asc, first_name asc
      `,
      [orgId, id]
    ),
    base.referred_by_contact_id
      ? client.query<{ id: string; first_name: string; last_name: string }>(
          `
          select unique_id as id, first_name, last_name
          from contacts
          where organization_id = $1 and unique_id = $2
          limit 1
          `,
          [orgId, base.referred_by_contact_id]
        )
      : Promise.resolve({ rows: [] } as { rows: { id: string; first_name: string; last_name: string }[] })
  ]);

  return {
    ...mapContactSummary(base),
    referredByContact:
      referredByContact.rows[0] && base.referred_by_contact_id
        ? {
            id: base.referred_by_contact_id,
            firstName: referredByContact.rows[0].first_name,
            lastName: referredByContact.rows[0].last_name
          }
        : null,
    phones: phones.rows.map((row) => ({ id: row.id, label: row.label, value: row.value, createdAt: row.created_at })),
    emails: emails.rows.map((row) => ({ id: row.id, label: row.label, value: row.value, createdAt: row.created_at })),
    websites: websites.rows.map((row) => ({ id: row.id, label: row.label, value: row.value, createdAt: row.created_at })),
    referrals: referrals.rows.map((row) => ({ id: row.id, firstName: row.first_name, lastName: row.last_name })),
    comments: comments.rows.map((row) => ({
      id: row.id,
      body: row.body,
      archived: row.archived,
      createdAt: row.created_at,
      authorDisplayName: row.author_name || row.author_email || "Unknown user"
    }))
  };
};

const replaceContactMethods = async (
  client: PoolClient,
  ctx: AuthedContext,
  actorUserId: string | null,
  contactId: string,
  payload: ContactUpsertInput
) => {
  await client.query("delete from contact_phone_numbers where organization_id = $1 and contact_id = $2", [ctx.orgId, contactId]);
  await client.query("delete from contact_emails where organization_id = $1 and contact_id = $2", [ctx.orgId, contactId]);
  await client.query("delete from contact_websites where organization_id = $1 and contact_id = $2", [ctx.orgId, contactId]);

  for (const phone of payload.phones ?? []) {
    await client.query(
      `
      insert into contact_phone_numbers (organization_id, contact_id, label, phone_number, created_by)
      values ($1, $2, $3, $4, $5)
      `,
      [ctx.orgId, contactId, phone.label ?? null, phone.value, actorUserId]
    );
  }

  for (const email of payload.emails ?? []) {
    await client.query(
      `
      insert into contact_emails (organization_id, contact_id, label, email, created_by)
      values ($1, $2, $3, $4, $5)
      `,
      [ctx.orgId, contactId, email.label ?? null, email.value, actorUserId]
    );
  }

  for (const website of payload.websites ?? []) {
    await client.query(
      `
      insert into contact_websites (organization_id, contact_id, label, url, created_by)
      values ($1, $2, $3, $4, $5)
      `,
      [ctx.orgId, contactId, website.label ?? null, website.value, actorUserId]
    );
  }
};

const extractLinkedInSnapshot = (profileUrl: string) => {
  const parsed = new URL(profileUrl);
  const slug = parsed.pathname.split("/").filter(Boolean).pop() || "profile";
  const safeSlug = slug.replace(/[^a-zA-Z0-9-]/g, "");

  return {
    profileUrl,
    profilePictureUrl: `https://picsum.photos/seed/${encodeURIComponent(safeSlug)}/200/200`,
    company: `Org ${safeSlug.slice(0, 24) || "Profile"}`,
    jobTitle: "Relationship Lead",
    location: "United States",
    capturedFromHost: parsed.hostname
  };
};

const parseCsvRows = (csvContent: string) => {
  const lines = csvContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  const hasHeaders = headers.includes("first_name") || headers.includes("firstname") || headers.includes("last_name") || headers.includes("lastname");
  const dataLines = hasHeaders ? lines.slice(1) : lines;

  return dataLines.slice(0, 250).map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const byHeader = (names: string[], fallbackIndex: number) => {
      const idx = names.map((name) => headers.indexOf(name)).find((index) => index >= 0);
      const pick = idx === undefined ? fallbackIndex : idx;
      return cells[pick] || "";
    };

    const firstName = hasHeaders ? byHeader(["first_name", "firstname", "first"], 0) : cells[0] || "";
    const lastName = hasHeaders ? byHeader(["last_name", "lastname", "last"], 1) : cells[1] || "";
    const company = hasHeaders ? byHeader(["company", "organization"], 2) : cells[2] || "";

    return {
      firstName,
      lastName,
      company
    };
  });
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

      case "entities/list":
      case "contact.list": {
        requireRole(ctx, ["admin", "creator", "participant"]);
        const searchTerm = (event.queryStringParameters?.search || "").trim();
        const contacts = await client.query<DbContact>(
          `
          select
            unique_id,
            organization_id,
            first_name,
            last_name,
            organization,
            role,
            internal_contact,
            referred_by,
            referred_by_contact_id,
            contact_type,
            status,
            linkedin_profile_url,
            linkedin_picture_url,
            linkedin_company,
            linkedin_job_title,
            linkedin_location,
            attributes,
            created_at,
            updated_at
          from contacts
          where organization_id = $1
            and (
              $2 = ''
              or (
                coalesce(search_document, ''::tsvector) @@ websearch_to_tsquery('simple', $2)
              )
              or exists (
                select 1
                from contact_phone_numbers p
                where p.organization_id = contacts.organization_id
                  and p.contact_id = contacts.unique_id
                  and (p.phone_number ilike ('%' || $2 || '%') or coalesce(p.label, '') ilike ('%' || $2 || '%'))
              )
              or exists (
                select 1
                from contact_emails e
                where e.organization_id = contacts.organization_id
                  and e.contact_id = contacts.unique_id
                  and (e.email ilike ('%' || $2 || '%') or coalesce(e.label, '') ilike ('%' || $2 || '%'))
              )
              or exists (
                select 1
                from contact_websites w
                where w.organization_id = contacts.organization_id
                  and w.contact_id = contacts.unique_id
                  and (w.url ilike ('%' || $2 || '%') or coalesce(w.label, '') ilike ('%' || $2 || '%'))
              )
              or exists (
                select 1
                from contact_comments c
                where c.organization_id = contacts.organization_id
                  and c.contact_id = contacts.unique_id
                  and c.deleted_at is null
                  and c.body ilike ('%' || $2 || '%')
              )
            )
          order by last_name asc, first_name asc
          limit 500
          `,
          [ctx.orgId, searchTerm]
        );

        return json(200, {
          ok: true,
          data: contacts.rows.map(mapContactSummary),
          meta: { orgId: ctx.orgId }
        });
      }

      case "entities/get":
      case "contact.get": {
        requireRole(ctx, ["admin", "creator", "participant"]);
        const id = event.queryStringParameters?.id;
        if (!id || !isUuid(id)) {
          return json(400, { ok: false, error: { code: "BAD_REQUEST", message: "Missing or invalid id" } });
        }

        const detail = await loadContactDetail(client, ctx.orgId, id);
        if (!detail) {
          return json(404, { ok: false, error: { code: "NOT_FOUND", message: "Contact not found" } });
        }

        return json(200, { ok: true, data: detail });
      }

      case "entities/create": {
        requireRole(ctx, ["admin", "creator"]);
        const payload = contactUpsertSchema.parse(parseBody(event));
        const actorUserId = await getActorUserId(client, ctx);

        const created = await client.query<{ unique_id: string }>(
          `
          insert into contacts (
            organization_id,
            first_name,
            last_name,
            organization,
            role,
            internal_contact,
            referred_by,
            referred_by_contact_id,
            contact_type,
            status,
            linkedin_profile_url,
            attributes,
            created_by,
            updated_by
          )
          values (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9::contact_type_enum,
            $10::contact_status_enum,
            $11,
            $12::contact_attribute_enum[],
            $13,
            $13
          )
          returning unique_id
          `,
          [
            ctx.orgId,
            payload.firstName,
            payload.lastName,
            payload.company ?? null,
            payload.role ?? null,
            payload.internalContact ?? null,
            payload.referredBy ?? null,
            payload.referredByContactId ?? null,
            payload.contactType,
            payload.status,
            payload.linkedInProfileUrl ?? null,
            payload.attributes ?? [],
            actorUserId
          ]
        );

        const id = created.rows[0].unique_id;
        await replaceContactMethods(client, ctx, actorUserId, id, payload);

        await writeAuditLog(client, ctx, {
          action: "contacts.create",
          entityType: "contacts",
          entityId: id,
          ip: event.headers["x-forwarded-for"] || "local",
          userAgent: event.headers["user-agent"] || "unknown"
        });

        const detail = await loadContactDetail(client, ctx.orgId, id);
        return json(201, { ok: true, data: detail });
      }

      case "entities/update":
      case "contact.update": {
        requireRole(ctx, ["admin", "creator"]);
        const payload = contactUpsertSchema.extend({ id: z.string().uuid() }).parse(parseBody(event));
        const actorUserId = await getActorUserId(client, ctx);

        const updated = await client.query<{ unique_id: string }>(
          `
          update contacts
          set
            first_name = $1,
            last_name = $2,
            organization = $3,
            role = $4,
            internal_contact = $5,
            referred_by = $6,
            referred_by_contact_id = $7,
            contact_type = $8::contact_type_enum,
            status = $9::contact_status_enum,
            linkedin_profile_url = $10,
            attributes = $11::contact_attribute_enum[],
            updated_by = $12
          where unique_id = $13 and organization_id = $14
          returning unique_id
          `,
          [
            payload.firstName,
            payload.lastName,
            payload.company ?? null,
            payload.role ?? null,
            payload.internalContact ?? null,
            payload.referredBy ?? null,
            payload.referredByContactId ?? null,
            payload.contactType,
            payload.status,
            payload.linkedInProfileUrl ?? null,
            payload.attributes ?? [],
            actorUserId,
            payload.id,
            ctx.orgId
          ]
        );

        if (!updated.rows[0]) {
          return json(404, { ok: false, error: { code: "NOT_FOUND", message: "Contact not found" } });
        }

        await replaceContactMethods(client, ctx, actorUserId, payload.id, payload);

        await writeAuditLog(client, ctx, {
          action: "contacts.update",
          entityType: "contacts",
          entityId: payload.id,
          ip: event.headers["x-forwarded-for"] || "local",
          userAgent: event.headers["user-agent"] || "unknown"
        });

        const detail = await loadContactDetail(client, ctx.orgId, payload.id);
        return json(200, { ok: true, data: detail });
      }

      case "entities/delete":
      case "contact.delete": {
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

      case "contact.importLinkedIn": {
        requireRole(ctx, ["admin", "creator"]);
        const payload = linkedInImportSchema.parse(parseBody(event));
        const actorUserId = await getActorUserId(client, ctx);
        const snapshot = extractLinkedInSnapshot(payload.profileUrl);

        let contactId = payload.contactId;
        if (!contactId) {
          const inserted = await client.query<{ unique_id: string }>(
            `
            insert into contacts (
              organization_id,
              first_name,
              last_name,
              organization,
              role,
              contact_type,
              status,
              linkedin_profile_url,
              linkedin_picture_url,
              linkedin_company,
              linkedin_job_title,
              linkedin_location,
              created_by,
              updated_by
            )
            values (
              $1,
              $2,
              $3,
              $4,
              $5,
              'General'::contact_type_enum,
              'Prospect'::contact_status_enum,
              $6,
              $7,
              $8,
              $9,
              $10,
              $11,
              $11
            )
            returning unique_id
            `,
            [
              ctx.orgId,
              payload.firstName || "LinkedIn",
              payload.lastName || "Import",
              payload.company || snapshot.company,
              snapshot.jobTitle,
              payload.profileUrl,
              snapshot.profilePictureUrl,
              snapshot.company,
              snapshot.jobTitle,
              snapshot.location,
              actorUserId
            ]
          );
          contactId = inserted.rows[0].unique_id;
        } else {
          const updated = await client.query<{ unique_id: string }>(
            `
            update contacts
            set
              linkedin_profile_url = $1,
              linkedin_picture_url = $2,
              linkedin_company = $3,
              linkedin_job_title = $4,
              linkedin_location = $5,
              updated_by = $6
            where unique_id = $7 and organization_id = $8
            returning unique_id
            `,
            [
              payload.profileUrl,
              snapshot.profilePictureUrl,
              snapshot.company,
              snapshot.jobTitle,
              snapshot.location,
              actorUserId,
              contactId,
              ctx.orgId
            ]
          );

          if (!updated.rows[0]) {
            return json(404, { ok: false, error: { code: "NOT_FOUND", message: "Contact not found" } });
          }
        }

        await client.query(
          `
          insert into linkedin_history (organization_id, contact_id, snapshot, captured_at, created_by)
          values ($1, $2, $3::jsonb, now(), $4)
          `,
          [ctx.orgId, contactId, JSON.stringify(snapshot), actorUserId]
        );

        await writeAuditLog(client, ctx, {
          action: "contacts.linkedin_import",
          entityType: "contacts",
          entityId: contactId,
          ip: event.headers["x-forwarded-for"] || "local",
          userAgent: event.headers["user-agent"] || "unknown",
          metadata: { profileUrl: payload.profileUrl }
        });

        const detail = await loadContactDetail(client, ctx.orgId, contactId);
        return json(200, { ok: true, data: detail });
      }

      case "contact.importCsv": {
        requireRole(ctx, ["admin", "creator"]);
        const payload = csvImportSchema.parse(parseBody(event));
        const actorUserId = await getActorUserId(client, ctx);
        const rows = parseCsvRows(payload.csvContent)
          .filter((row) => row.firstName && row.lastName)
          .slice(0, 200);

        const insertedIds: string[] = [];
        for (const row of rows) {
          const inserted = await client.query<{ unique_id: string }>(
            `
            insert into contacts (
              organization_id,
              first_name,
              last_name,
              organization,
              role,
              contact_type,
              status,
              created_by,
              updated_by
            )
            values ($1, $2, $3, $4, 'Unknown', 'General'::contact_type_enum, 'Prospect'::contact_status_enum, $5, $5)
            returning unique_id
            `,
            [ctx.orgId, row.firstName, row.lastName, row.company || null, actorUserId]
          );
          insertedIds.push(inserted.rows[0].unique_id);
        }

        await writeAuditLog(client, ctx, {
          action: "contacts.csv_import",
          entityType: "contacts",
          ip: event.headers["x-forwarded-for"] || "local",
          userAgent: event.headers["user-agent"] || "unknown",
          metadata: { inserted: insertedIds.length }
        });

        return json(200, {
          ok: true,
          data: {
            insertedCount: insertedIds.length,
            insertedIds
          }
        });
      }

      case "contact.addComment": {
        requireRole(ctx, ["admin", "creator", "participant"]);
        const payload = addCommentSchema.parse(parseBody(event));
        const actorUserId = await getActorUserId(client, ctx);

        const exists = await client.query<{ unique_id: string }>(
          "select unique_id from contacts where unique_id = $1 and organization_id = $2 limit 1",
          [payload.contactId, ctx.orgId]
        );

        if (!exists.rows[0]) {
          return json(404, { ok: false, error: { code: "NOT_FOUND", message: "Contact not found" } });
        }

        const inserted = await client.query<{ id: string; created_at: string }>(
          `
          insert into contact_comments (organization_id, contact_id, body, created_by)
          values ($1, $2, $3, $4)
          returning id, created_at
          `,
          [ctx.orgId, payload.contactId, payload.body, actorUserId]
        );

        await writeAuditLog(client, ctx, {
          action: "comments.create",
          entityType: "contact_comments",
          entityId: inserted.rows[0].id,
          ip: event.headers["x-forwarded-for"] || "local",
          userAgent: event.headers["user-agent"] || "unknown",
          metadata: { contactId: payload.contactId }
        });

        return json(201, {
          ok: true,
          data: {
            id: inserted.rows[0].id,
            body: payload.body,
            archived: false,
            createdAt: inserted.rows[0].created_at
          }
        });
      }

      case "contact.archiveComment": {
        requireRole(ctx, ["admin", "creator"]);
        const payload = commentIdSchema.parse(parseBody(event));

        const archived = await client.query<{ id: string }>(
          `
          update contact_comments
          set archived = true
          where id = $1 and organization_id = $2 and deleted_at is null
          returning id
          `,
          [payload.commentId, ctx.orgId]
        );

        if (!archived.rows[0]) {
          return json(404, { ok: false, error: { code: "NOT_FOUND", message: "Comment not found" } });
        }

        await writeAuditLog(client, ctx, {
          action: "comments.archive",
          entityType: "contact_comments",
          entityId: payload.commentId,
          ip: event.headers["x-forwarded-for"] || "local",
          userAgent: event.headers["user-agent"] || "unknown"
        });

        return json(200, { ok: true, data: { archived: true, id: payload.commentId } });
      }

      case "contact.deleteComment": {
        requireRole(ctx, ["admin"]);
        const payload = commentIdSchema.parse(parseBody(event));

        const deleted = await client.query<{ id: string }>(
          `
          update contact_comments
          set deleted_at = now()
          where id = $1 and organization_id = $2 and deleted_at is null
          returning id
          `,
          [payload.commentId, ctx.orgId]
        );

        if (!deleted.rows[0]) {
          return json(404, { ok: false, error: { code: "NOT_FOUND", message: "Comment not found" } });
        }

        await writeAuditLog(client, ctx, {
          action: "comments.delete",
          entityType: "contact_comments",
          entityId: payload.commentId,
          ip: event.headers["x-forwarded-for"] || "local",
          userAgent: event.headers["user-agent"] || "unknown"
        });

        return json(200, { ok: true, data: { deleted: true, id: payload.commentId } });
      }

      case "contact.getLinkedInHistory": {
        requireRole(ctx, ["admin", "creator", "participant"]);
        const contactId = event.queryStringParameters?.contactId;
        if (!contactId || !isUuid(contactId)) {
          return json(400, { ok: false, error: { code: "BAD_REQUEST", message: "Missing or invalid contactId" } });
        }

        const history = await client.query<DbLinkedInHistory>(
          `
          select id, snapshot, captured_at, created_at
          from linkedin_history
          where organization_id = $1 and contact_id = $2
          order by captured_at desc
          `,
          [ctx.orgId, contactId]
        );

        return json(200, {
          ok: true,
          data: history.rows.map((item) => ({
            id: item.id,
            snapshot: item.snapshot,
            capturedAt: item.captured_at,
            createdAt: item.created_at
          }))
        });
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

    if (
      lower.includes("invalid token") ||
      lower.includes("authorization") ||
      lower.includes("issuer") ||
      lower.includes("audience")
    ) {
      return json(401, { ok: false, error: { code: "UNAUTHORIZED", message } });
    }

    return json(500, { ok: false, error: { code: "DATABASE_ERROR", message } });
  }
};
