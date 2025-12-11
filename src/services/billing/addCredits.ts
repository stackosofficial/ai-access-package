import { Pool } from 'pg';
import * as TE from 'fp-ts/TaskEither';

import * as CreditsAPI from './entrypoint';

/**
 * Add credits to an organisation using an API key
 * This is a standalone function that can be used anywhere
 *
 * @param pool - PostgreSQL connection pool
 * @param apiKey - The API key to identify the organisation
 * @param creditsToAdd - Amount of credits to add (in dollars, as a string)
 * @param appName - The application name (for logging purposes)
 * @returns TaskEither that resolves when credits are added successfully
 *
 * @example
 * ```typescript
 * import { addCredits } from '@decloudlabs/ap';
 * import { Pool } from 'pg';
 *
 * const pool = new Pool({ connectionString: process.env.POSTGRES_URL });
 * const result = await addCredits(pool, 'sky_abc123...', '10.50', 'my-app')();
 *
 * if (result._tag === 'Left') {
 *   console.error('Failed to add credits:', result.left);
 * } else {
 *   console.log('Credits added successfully');
 * }
 * ```
 */
export function addCredits(
  pool: Pool,
  apiKey: string,
  creditsToAdd: string,
  appName: string
): TE.TaskEither<Error, void> {
  return CreditsAPI.addCredits(pool, apiKey, creditsToAdd, appName);
}

