import { z } from "zod";
import { HttpError } from "../middleware/errorHandler";

const uuid = z.string().uuid();

/**
 * Record ids are UUID columns, and Postgres rejects anything else with an error that
 * used to surface as a 500. A malformed id can't match a record, so it gets the same
 * 404 as an id that doesn't exist (defect D-05; D-01 fixed the same for products).
 */
export function parseId(id: string, notFoundMessage: string): string {
  if (!uuid.safeParse(id).success) throw new HttpError(404, notFoundMessage);
  return id;
}
