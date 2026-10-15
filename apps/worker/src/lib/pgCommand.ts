/**
 * Helpers for running pg_dump and psql without leaking the database password. The
 * password never goes on the command line (where error messages, process lists and logs
 * can show it): it is taken out of the connection string and passed in PGPASSWORD, which
 * libpq reads. Failure messages are built from the tool's own error output and exit
 * status only, never from Node's error message, which repeats the whole command line.
 */

export interface PgConnection {
  /** The connection string without its password. */
  url: string;
  /** Environment for the child process: PGPASSWORD when the URL had a password. */
  env: NodeJS.ProcessEnv;
}

export function withoutPassword(connectionString: string, baseEnv: NodeJS.ProcessEnv = process.env): PgConnection {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    // Not a URL (e.g. "host=… dbname=…"): pass it on unchanged; libpq parses it.
    return { url: connectionString, env: baseEnv };
  }
  if (!url.password) return { url: url.toString(), env: baseEnv };
  let password = url.password;
  try {
    password = decodeURIComponent(password);
  } catch {
    // A "%" that isn't an escape: the raw text is the password.
  }
  url.password = "";
  return { url: url.toString(), env: { ...baseEnv, PGPASSWORD: password } };
}

/** Masks the password in any connection string inside `text`. */
export function redactConnectionStrings(text: string): string {
  return text.replace(/(postgres(?:ql)?:\/\/[^:/@\s]+):[^@\s]*@/gi, "$1:***@");
}

/** A readable reason a pg_dump or psql run failed, never including its command line. */
export function describeCommandFailure(
  tool: string,
  error: { code?: string | number | null; signal?: string | null; killed?: boolean },
  stderr: string
): string {
  const output = redactConnectionStrings(stderr.trim());
  if (output) return `${tool} failed: ${output}`;
  if (error.killed || error.signal === "SIGTERM") return `${tool} took too long and was stopped`;
  return `${tool} failed (${error.signal ? `signal ${error.signal}` : `exit code ${error.code ?? "unknown"}`})`;
}
