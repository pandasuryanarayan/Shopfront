import { badRequest } from './errors.js';

/** Validates `data` against a zod schema, throwing a 400 with field details. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.') || '(root)',
      message: i.message,
    }));
    throw badRequest('Some fields need your attention', details);
  }
  return result.data;
}
