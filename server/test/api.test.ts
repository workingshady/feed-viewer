import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { env } from "../src/env.js";
import { decideAutoApply, selectVersionsToPrune } from "../src/sources/policy.js";
import { isAllowedBlobPath } from "../src/sources/blobStore.js";
import { signupDecision } from "../src/auth/policy.js";

const deleted: string[] = [];
const app = createApp({
  blobStore: { del: async (urls) => void deleted.push(...urls) },
  loadListings: async () => [
    { id: "L-1", reference: "L-1", title: "Shared flat", price: 100 },
    { id: "L-2", reference: "L-2", title: "Other flat", price: 200 },
  ],
  extraRoutes: (a) =>
    a.get("/api/_boom", () => {
      throw new Error("db password leaked");
    }),
});

async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AuditEvent","UserPref","LoginAttempt","Session","ShareLink","Invite","FeedVersion","Source","User" RESTART IDENTITY CASCADE',
  );
  deleted.length = 0;
  env.ALLOW_SIGNUP = false;
}

async function signUp(username: string) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send({ username, password: "correct-horse" });
  return { agent, res };
}

const sha = (n: number) => n.toString(16).padStart(64, "0");
const blob = (sourceId: string, upload: string, file: string) =>
  `https://store.public.blob.vercel-storage.com/sources/${sourceId}/${upload}/${file}-Ab12.gz`;
function versionBody(sourceId: string, n: number, listingCount: number) {
  const upload = `upload${String(n).padStart(6, "0")}`;
  return {
    uploadId: upload,
    fileName: `feed-${n}.xml`,
    fileBytes: 1000,
    sha256: sha(n),
    xmlBlobUrl: blob(sourceId, upload, "feed.xml"),
    listingsBlobUrl: blob(sourceId, upload, "listings.json"),
    listingCount,
  };
}

describe("policies", () => {
  it("signup: first user admin, then closed unless enabled", () => {
    expect(signupDecision(0, false)).toEqual({ allowed: true, role: "admin" });
    expect(signupDecision(3, false)).toEqual({ allowed: false });
    expect(signupDecision(3, true)).toEqual({ allowed: true, role: "viewer" });
  });

  it("auto-apply blocks drops over 30%", () => {
    expect(decideAutoApply(null, 10)).toEqual({ apply: true });
    expect(decideAutoApply(100, 70)).toEqual({ apply: true });
    expect(decideAutoApply(100, 69)).toEqual({ apply: false, reason: "count_drop" });
  });

  it("retention keeps pinned and live versions", () => {
    const v = (n: number, pinned = false) => ({ id: `v${n}`, number: n, pinned });
    const seven = [1, 2, 3, 4, 5, 6, 7].map((n) => v(n));
    expect(selectVersionsToPrune(seven, 5, "v1")).toEqual(["v2", "v3"]);
    expect(selectVersionsToPrune([v(1), v(2, true), ...seven.slice(2)], 5, "v1")).toEqual(["v3", "v4"]);
  });

  it("blob paths are confined to a source upload folder", () => {
    expect(isAllowedBlobPath("sources/abc123/AbCdEf123456/feed.xml.gz")).toBe(true);
    expect(isAllowedBlobPath("../x")).toBe(false);
    expect(isAllowedBlobPath("sources/abc123/AbCdEf123456/evil.html")).toBe(false);
  });
});

describe("api", () => {
  beforeEach(resetDb);

  it("never leaks internal errors", async () => {
    const res = await request(app).get("/api/_boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "server_error" });
  });

  it("auth: first user is admin, signup then closes, login is rate limited", async () => {
    const { agent, res } = await signUp("owner");
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("admin");
    expect(String(res.headers["set-cookie"])).toContain("HttpOnly");
    expect((await agent.get("/api/auth/me")).body.user.username).toBe("owner");

    expect((await signUp("intruder")).res.status).toBe(403);
    env.ALLOW_SIGNUP = true;
    expect((await signUp("guest")).res.body.user.role).toBe("viewer");

    for (let i = 0; i < 5; i++) {
      expect((await request(app).post("/api/auth/login").send({ username: "owner", password: "wrong" })).status).toBe(401);
    }
    const blocked = await request(app).post("/api/auth/login").send({ username: "owner", password: "correct-horse" });
    expect(blocked.status).toBe(429);
  });

  it("viewers cannot mutate; the last admin cannot be demoted", async () => {
    const { agent: admin, res } = await signUp("owner");
    env.ALLOW_SIGNUP = true;
    const { agent: viewer } = await signUp("guest");
    expect((await viewer.post("/api/sources").send({ name: "X" })).status).toBe(403);
    expect((await viewer.get("/api/admin/users")).status).toBe(403);
    const demote = await admin.patch(`/api/admin/users/${res.body.user.id}`).send({ role: "viewer" });
    expect(demote.body).toEqual({ error: "last_admin" });
  });

  it("observability: deep health, browser error reports, admin-only status", async () => {
    expect((await request(app).get("/api/health?deep=1")).body).toMatchObject({ ok: true });
    const { agent: admin } = await signUp("owner");
    expect((await request(app).post("/api/telemetry/error").send({ message: "boom", path: "/x" })).status).toBe(202);
    const status = await admin.get("/api/admin/status");
    expect(status.body.last24h.clientErrors).toBe(1);
    env.ALLOW_SIGNUP = true;
    const { agent: viewer } = await signUp("guest");
    expect((await viewer.get("/api/admin/status")).status).toBe(403);
  });

  it("invites: one-time link creates an account; reset link replaces the password", async () => {
    const { agent: admin } = await signUp("owner");
    const inv = await admin.post("/api/admin/invites").send({ role: "editor" });
    expect(inv.status).toBe(201);
    const token = inv.body.token as string;
    expect((await request(app).get(`/api/invites/${token}`)).body).toMatchObject({ kind: "invite", role: "editor" });

    const newbie = request.agent(app);
    const accepted = await newbie.post(`/api/invites/${token}/accept`).send({ username: "sara", password: "sara-password" });
    expect(accepted.body.user).toMatchObject({ username: "sara", role: "editor" });
    expect((await request(app).post(`/api/invites/${token}/accept`).send({ username: "eve", password: "eve-password" })).status).toBe(404);

    const reset = await admin.post(`/api/admin/users/${accepted.body.user.id}/reset-link`);
    await request(app).post(`/api/invites/${reset.body.token}/accept`).send({ password: "brand-new-pass" }).expect(200);
    expect((await newbie.get("/api/auth/me")).body.user).toBeNull(); // old sessions signed out
    expect((await request(app).post("/api/auth/login").send({ username: "sara", password: "brand-new-pass" })).status).toBe(200);
  });

  it("share links: read-only, counted, revocable, single 404 for bad links", async () => {
    const { agent } = await signUp("owner");
    const src = (await agent.post("/api/sources").send({ name: "Agency" })).body.source;
    await agent.post(`/api/sources/${src.id}/versions`).send(versionBody(src.id, 1, 2)).expect(201);

    const one = await agent.post("/api/shares").send({ kind: "listing", sourceId: src.id, listingRef: "L-1", label: "Shared flat" });
    const pub = await request(app).get(`/api/public/shares/${one.body.token}`);
    expect(pub.headers["x-robots-tag"]).toContain("noindex");
    expect(pub.body).toMatchObject({ kind: "listing", listing: { title: "Shared flat" } });
    expect(JSON.stringify(pub.body)).not.toContain("Other flat");

    const all = await agent.post("/api/shares").send({ kind: "source", sourceId: src.id, label: "All", expiresInDays: null });
    expect((await request(app).get(`/api/public/shares/${all.body.token}`)).body).toMatchObject({ kind: "source", listingCount: 2 });
    expect((await agent.get("/api/shares")).body.shares[0].viewCount).toBeGreaterThanOrEqual(0);

    await agent.delete(`/api/shares/${one.body.share.id}`).expect(200);
    expect((await request(app).get(`/api/public/shares/${one.body.token}`)).body).toEqual({ error: "invalid_link" });
    expect((await request(app).get("/api/public/shares/not-a-real-token")).body).toEqual({ error: "invalid_link" });
  });

  it("versions: auto-apply, safety block, apply, delete, duplicates, cleanup", async () => {
    const { agent } = await signUp("owner");
    const src = (await agent.post("/api/sources").send({ name: "White & Co", agencyName: "White & Co" })).body.source;
    const base = `/api/sources/${src.id}/versions`;

    const v1 = await agent.post(base).send(versionBody(src.id, 1, 100));
    expect(v1.body).toMatchObject({ applied: true, duplicate: false });
    const v2 = await agent.post(base).send(versionBody(src.id, 2, 50));
    expect(v2.body).toMatchObject({ applied: false, blockedReason: "count_drop" });

    expect((await agent.delete(`${base}/${v1.body.version.id}`)).status).toBe(409);
    await agent.post(`${base}/${v2.body.version.id}/apply`).expect(200);
    await agent.delete(`${base}/${v1.body.version.id}`).expect(200);
    expect(deleted).toEqual([versionBody(src.id, 1, 0).xmlBlobUrl, versionBody(src.id, 1, 0).listingsBlobUrl]);
    expect((await agent.delete(`${base}/${v1.body.version.id}`)).status).toBe(404);

    const dup = await agent.post(base).send({ ...versionBody(src.id, 2, 50), uploadId: "another0001" });
    expect(dup.body).toMatchObject({ duplicate: true, version: { id: v2.body.version.id } });

    const foreign = await agent.post(base).send(versionBody("othersource", 9, 50));
    expect(foreign.body).toEqual({ error: "invalid_blob_url" });

    await agent.delete(`/api/sources/${src.id}`).expect(200);
    expect((await agent.get("/api/sources")).body.sources).toEqual([]);
  });

  it("clear-all: admin only, needs the typed phrase, removes every source and file", async () => {
    const { agent } = await signUp("owner");
    for (const name of ["A", "B"]) {
      const src = (await agent.post("/api/sources").send({ name, agencyName: name })).body.source;
      await agent.post(`/api/sources/${src.id}/versions`).send(versionBody(src.id, name === "A" ? 1 : 2, 10)).expect(201);
    }
    expect((await agent.post("/api/sources/clear-all").send({ confirm: "yes" })).status).toBe(400);
    expect((await agent.get("/api/sources")).body.sources).toHaveLength(2);

    // An editor (not admin) is refused.
    env.ALLOW_SIGNUP = true;
    await signUp("editor1");
    const ed = (await agent.get("/api/admin/users")).body.users.find((u: { username: string }) => u.username === "editor1");
    await agent.patch(`/api/admin/users/${ed.id}`).send({ role: "editor" }).expect(200);
    const editor = request.agent(app);
    await editor.post("/api/auth/login").send({ username: "editor1", password: "correct-horse" }).expect(200);
    expect((await editor.post("/api/sources/clear-all").send({ confirm: "DELETE ALL" })).status).toBe(403);

    const r = await agent.post("/api/sources/clear-all").send({ confirm: "DELETE ALL" }).expect(200);
    expect(r.body).toEqual({ ok: true, deletedSources: 2, deletedVersions: 2 });
    expect(deleted).toHaveLength(4);
    expect((await agent.get("/api/sources")).body.sources).toEqual([]);
  });
});
