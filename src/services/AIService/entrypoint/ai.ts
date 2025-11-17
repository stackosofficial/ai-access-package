import * as TE from "fp-ts/TaskEither";
import { pipe } from "fp-ts/function";
import { requestPayloadSchema } from "../../../types/schemas";
import type { RequestPayload } from "../../../types/schemas";
import { callAIModel } from "../domain/aiModel";
import type { AIModelResponse } from "../domain/aiModel";

/**
 * Validate request payload using Zod schema (entrypoint validation)
 */
const validateRequestPayload = (
  data: unknown
): TE.TaskEither<Error, RequestPayload> => {
  const result = requestPayloadSchema.safeParse(data);

  if (!result.success) {
    const errorMessages = result.error.issues
      .map((err) => `${err.path.join(".")}: ${err.message}`)
      .join(", ");

    return TE.left(new Error(`Validation failed: ${errorMessages}`));
  }

  return TE.right(result.data);
};

/**
 * Main entry point: Validate params, then call domain logic
 */
export const callAI = (
  params: unknown
): TE.TaskEither<Error, AIModelResponse> => {
  return pipe(
    validateRequestPayload(params), // Entrypoint validates params
    TE.chain(callAIModel) // Pass validated params to domain
  );
};

/**
 * Execute the AI call and return the result
 */
export const executeAICall = async (
  params: unknown
): Promise<
  { success: true; data: AIModelResponse } | { success: false; error: Error }
> => {
  const result = await callAI(params)();

  if (result._tag === "Left") {
    return {
      success: false,
      error: result.left,
    };
  }

  return {
    success: true,
    data: result.right,
  };
};
