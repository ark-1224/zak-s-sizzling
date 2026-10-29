import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCode, maskEmail } from "../../src/modules/auth/loginCodes";
import {
  describeBrevoError,
  loginCodeEmail,
  loginCodesEnabled,
  LoginMailError,
  sendLoginEmail,
  testEmail,
} from "../../src/lib/loginMail";

// The parts of emailed sign-in codes that need no database: the code itself, the
// partly hidden address, the emails, and the Brevo sender (with fetch faked).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("generateCode", () => {
  it("is always 6 digits, keeping leading zeros", () => {
    for (let i = 0; i < 2000; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it("varies from one sign-in to the next", () => {
    expect(new Set(Array.from({ length: 200 }, generateCode)).size).toBeGreaterThan(190);
  });
});

describe("maskEmail", () => {
  it.each([
    ["maria.santos@gmail.com", "ma•••@gmail.com"],
    ["jo@gmail.com", "j•••@gmail.com"],
    ["a@gmail.com", "•••@gmail.com"],
    ["odd@name@example.com", "od•••@example.com"],
    ["not-an-email", "•••"],
  ])("%s → %s", (email, masked) => {
    expect(maskEmail(email)).toBe(masked);
  });
});

describe("loginCodesEnabled", () => {
  it.each([
    [undefined, true],
    ["on", true],
    ["", true],
    ["off", false],
    [" OFF ", false],
  ])("LOGIN_CODES=%s → %s", (value, enabled) => {
    if (value === undefined) vi.stubEnv("LOGIN_CODES", undefined);
    else vi.stubEnv("LOGIN_CODES", value);
    expect(loginCodesEnabled()).toBe(enabled);
  });
});

describe("the emails", () => {
  it("puts the code in the subject, the text and the HTML", () => {
    const email = loginCodeEmail({ email: "staff@example.com", name: "Jane" }, "042719", 10);

    expect(email.subject).toBe("042719 is your Zak's Sizzling Hub sign-in code");
    expect(email.text).toContain("Your sign-in code is 042719. It works for 10 minutes.");
    expect(email.html).toContain(">042719</p>");
    expect(email.text).toContain("If you didn't just sign in, someone else has your password");
  });

  it("escapes the account name in the HTML", () => {
    const email = testEmail({ email: "x@example.com", name: '<img src=x onerror="alert(1)">' });

    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&#60;img");
  });
});

describe("describeBrevoError", () => {
  it.each([
    [401, "Key not found", "Brevo refused the API key. Check BREVO_API_KEY (Brevo → SMTP & API → API keys)."],
    [
      401,
      "We have detected you are using an unrecognised IP address 203.0.113.9",
      "Brevo blocked the API's IP address. Turn off IP blocking in Brevo (Security → Authorised IPs).",
    ],
    [
      403,
      "Unrecognised IP address 203.0.113.9. Add it to authorised IPs",
      "Brevo blocked the API's IP address. Turn off IP blocking in Brevo (Security → Authorised IPs).",
    ],
    [
      400,
      "Sender is not valid",
      "Brevo refused the sender. LOGIN_CODE_FROM must be a sender verified in Brevo (Senders, domains & IPs).",
    ],
    [429, "Too many requests", "Brevo's sending limit was reached. Try again later."],
    [500, "Internal error", "Brevo refused the email (500): Internal error"],
  ])("%i %s", (status, message, described) => {
    expect(describeBrevoError(status, message)).toBe(described);
  });
});

describe("sendLoginEmail", () => {
  const email = loginCodeEmail({ email: "staff@example.com", name: "Jane" }, "123456", 10);

  function fakeFetch(response: Response | Error) {
    const fake = vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    });
    vi.stubGlobal("fetch", fake);
    return fake;
  }

  it("posts the email to Brevo with the API key and the verified sender", async () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    vi.stubEnv("LOGIN_CODE_FROM", "zaks.codes@gmail.com");
    const fake = fakeFetch(new Response(JSON.stringify({ messageId: "<1@brevo>" }), { status: 201 }));

    expect(await sendLoginEmail(email)).toBe("sent");
    const [url, init] = fake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(new Headers(init.headers).get("api-key")).toBe("xkeysib-test");
    expect(JSON.parse(String(init.body))).toEqual({
      sender: { name: "Zak's Sizzling Hub", email: "zaks.codes@gmail.com" },
      to: [{ email: "staff@example.com", name: "Jane" }],
      subject: email.subject,
      textContent: email.text,
      htmlContent: email.html,
    });
  });

  it("explains Brevo's refusal", async () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-wrong");
    vi.stubEnv("LOGIN_CODE_FROM", "zaks.codes@gmail.com");
    fakeFetch(new Response(JSON.stringify({ code: "unauthorized", message: "Key not found" }), { status: 401 }));

    await expect(sendLoginEmail(email)).rejects.toThrow(
      new LoginMailError("Brevo refused the API key. Check BREVO_API_KEY (Brevo → SMTP & API → API keys).")
    );
  });

  it("says when Brevo can't be reached", async () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    vi.stubEnv("LOGIN_CODE_FROM", "zaks.codes@gmail.com");
    fakeFetch(new TypeError("fetch failed"));

    await expect(sendLoginEmail(email)).rejects.toThrow("Could not reach Brevo: fetch failed");
  });

  it("needs LOGIN_CODE_FROM when the API key is set", async () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    vi.stubEnv("LOGIN_CODE_FROM", "");
    const fake = fakeFetch(new Response("{}", { status: 201 }));

    await expect(sendLoginEmail(email)).rejects.toThrow("Set LOGIN_CODE_FROM to the sender address verified in Brevo.");
    expect(fake).not.toHaveBeenCalled();
  });

  it("refuses in production without an API key", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BREVO_API_KEY", "");

    await expect(sendLoginEmail(email)).rejects.toThrow("Sign-in emails aren't set up: set BREVO_API_KEY and LOGIN_CODE_FROM.");
  });

  it("prints the email in the log instead outside production", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    const fake = fakeFetch(new Response("{}", { status: 201 }));
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await sendLoginEmail(email)).toBe("logged");
    expect(logs).toHaveBeenCalledWith(expect.stringContaining("to staff@example.com: 123456 is your"));
    expect(fake).not.toHaveBeenCalled();
    logs.mockRestore();
  });
});
