import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { signAccessToken, signKioskSessionToken } from "../../src/lib/jwt";
import { authenticate, type AuthenticatedRequest } from "../../src/middleware/authenticate";
import { authorize } from "../../src/middleware/authorize";
import { errorHandler, HttpError } from "../../src/middleware/errorHandler";

const fakeReq = (authorization?: string) => ({ headers: authorization ? { authorization } : {} }) as AuthenticatedRequest;
const fakeRes = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
};
/** Runs a middleware and returns what it passed to next(): undefined on success, the error otherwise. */
const run = (mw: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void, req: AuthenticatedRequest) => {
  const next = vi.fn();
  mw(req, fakeRes(), next);
  expect(next).toHaveBeenCalledOnce();
  return next.mock.calls[0][0] as HttpError | undefined;
};

describe("authenticate", () => {
  it("rejects a request with no Authorization header", () => {
    const err = run(authenticate, fakeReq());

    expect(err).toMatchObject({ status: 401, message: "Missing bearer token" });
  });

  it("rejects a header that is not a Bearer token", () => {
    const err = run(authenticate, fakeReq("Basic abc123"));

    expect(err?.status).toBe(401);
  });

  it("attaches the signed-in staff user from an access token", () => {
    const req = fakeReq(`Bearer ${signAccessToken({ sub: "u1", role: "staff", name: "Jane", email: "jane@test.local" })}`);

    expect(run(authenticate, req)).toBeUndefined();
    expect(req.user).toEqual({ id: "u1", role: "staff", name: "Jane", email: "jane@test.local" });
  });

  it("treats a kiosk session token as an anonymous customer", () => {
    const req = fakeReq(`Bearer ${signKioskSessionToken({ sessionId: "kiosk-1", role: "customer" })}`);

    expect(run(authenticate, req)).toBeUndefined();
    expect(req.user).toMatchObject({ id: "kiosk-1", role: "customer" });
    expect(req.kioskSessionId).toBe("kiosk-1");
  });

  it("rejects a token it cannot verify", () => {
    const err = run(authenticate, fakeReq("Bearer not-a-token"));

    expect(err).toMatchObject({ status: 401, message: "Invalid or expired token" });
  });
});

describe("authorize", () => {
  const withRole = (role: "admin" | "staff" | "customer") => ({ ...fakeReq(), user: { id: "u1", role, name: "", email: "" } }) as AuthenticatedRequest;

  it("lets an allowed role through", () => {
    expect(run(authorize("admin", "staff"), withRole("staff"))).toBeUndefined();
  });

  it("returns 403 for a role that is not allowed", () => {
    expect(run(authorize("admin"), withRole("staff"))).toMatchObject({ status: 403, message: "Insufficient permissions" });
  });

  it("returns 401 when no user is attached", () => {
    expect(run(authorize("admin"), fakeReq())?.status).toBe(401);
  });
});

describe("errorHandler", () => {
  const handle = (err: unknown) => {
    const res = fakeRes();
    errorHandler(err, {} as Request, res, vi.fn());
    return res;
  };

  it("turns an HttpError into its status and message", () => {
    const res = handle(new HttpError(404, "Product not found"));

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Product not found" });
  });

  it("turns a validation error into 400 with details", () => {
    const result = z.object({ price: z.number() }).safeParse({ price: "abc" });
    const res = handle(result.error);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Validation failed", details: expect.any(Object) }));
  });

  it("hides the details of unexpected errors behind a generic 500", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = handle(new Error("database password is wrong"));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    log.mockRestore();
  });
});
