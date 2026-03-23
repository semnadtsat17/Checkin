import { v4 as uuidv4 } from 'uuid';

/** Generate a new UUID v4. Centralised so swap-out (e.g. nanoid) is one change. */
export function generateId(): string {
  return uuidv4();
}
