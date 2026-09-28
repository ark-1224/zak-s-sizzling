import request from "supertest";
import { createApp } from "../src/app";
import { PASSWORD, USERS } from "./fixtures";

export const app = createApp();

/** Signs in a seeded account and returns its access token. */
export async function loginAs(user: keyof typeof USERS): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email: USERS[user].email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`Login as ${user} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.accessToken;
}

/** Starts an anonymous kiosk session and returns its customer token. */
export async function kioskToken(): Promise<string> {
  const res = await request(app).post("/api/auth/kiosk-session");
  if (res.status !== 200) throw new Error(`Kiosk session failed: ${res.status}`);
  return res.body.token;
}
