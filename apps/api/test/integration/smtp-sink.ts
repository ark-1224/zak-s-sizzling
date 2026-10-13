import { createServer, type Server } from "node:net";

/**
 * A minimal SMTP server for tests: accepts any sign-in and keeps every message it is
 * sent, so a test can follow an email through nodemailer's real SMTP path without
 * sending anything anywhere. Speaks just enough SMTP for nodemailer: EHLO with AUTH
 * PLAIN/LOGIN, MAIL, RCPT, DATA, RSET, QUIT. No TLS.
 */

export interface ReceivedMail {
  /** "user:password" the client signed in with, or null if it didn't. */
  auth: string | null;
  from: string;
  to: string[];
  /** The whole message, with quoted-printable soft breaks and escapes decoded. */
  content: string;
  subject: string;
}

export interface SmtpSink {
  port: number;
  inbox: ReceivedMail[];
  close(): Promise<void>;
}

const fromBase64 = (s: string) => Buffer.from(s, "base64").toString("utf8");
const decodeQuotedPrintable = (s: string) =>
  s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

export async function startSmtpSink(): Promise<SmtpSink> {
  const inbox: ReceivedMail[] = [];

  const server: Server = createServer((socket) => {
    socket.setEncoding("utf8");
    const reply = (line: string) => socket.write(`${line}\r\n`);
    let buffer = "";
    let auth: string | null = null;
    let loginStep: "user" | "password" | null = null;
    let loginUser = "";
    let inData = false;
    let mail = { from: "", to: [] as string[], data: "" };

    reply("220 sink.test ESMTP");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      for (let end = buffer.indexOf("\r\n"); end !== -1; end = buffer.indexOf("\r\n")) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);

        if (inData) {
          if (line === ".") {
            const content = decodeQuotedPrintable(mail.data);
            const subject = /^Subject: (.*)$/m.exec(content)?.[1] ?? "";
            inbox.push({ auth, from: mail.from, to: mail.to, content, subject });
            mail = { from: "", to: [], data: "" };
            inData = false;
            reply("250 OK: queued");
          } else {
            mail.data += `${line.startsWith("..") ? line.slice(1) : line}\n`;
          }
          continue;
        }
        if (loginStep === "user") {
          loginUser = fromBase64(line);
          loginStep = "password";
          reply("334 UGFzc3dvcmQ6");
          continue;
        }
        if (loginStep === "password") {
          auth = `${loginUser}:${fromBase64(line)}`;
          loginStep = null;
          reply("235 Authentication successful");
          continue;
        }

        const [command, ...args] = line.split(" ");
        switch (command.toUpperCase()) {
          case "EHLO":
            socket.write("250-sink.test\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
            break;
          case "HELO":
            reply("250 sink.test");
            break;
          case "AUTH":
            if (args[0]?.toUpperCase() === "PLAIN") {
              const [, user, password] = fromBase64(args[1] ?? "").split("\0");
              auth = `${user}:${password}`;
              reply("235 Authentication successful");
            } else {
              loginStep = "user";
              reply("334 VXNlcm5hbWU6");
            }
            break;
          case "MAIL":
            mail.from = /<(.*?)>/.exec(line)?.[1] ?? "";
            reply("250 OK");
            break;
          case "RCPT":
            mail.to.push(/<(.*?)>/.exec(line)?.[1] ?? "");
            reply("250 OK");
            break;
          case "DATA":
            inData = true;
            reply("354 End data with <CR><LF>.<CR><LF>");
            break;
          case "QUIT":
            reply("221 Bye");
            socket.end();
            break;
          default:
            reply("250 OK");
        }
      }
    });
    socket.on("error", () => {});
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as { port: number }).port,
    inbox,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
