import { pipe } from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';

import { requestPayloadSchema } from '../../../types/schemas';
import type { RequestPayload } from '../../../types/schemas';
import { callAIModel } from '../domain/aiModel';
import type { AIModelResponse } from '../domain/aiModel';

const validateRequestPayload = (data: unknown): TE.TaskEither<Error, RequestPayload> => {
  const result = requestPayloadSchema.safeParse(data);

  if (!result.success) {
    const errorMessages = result.error.issues.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');

    return TE.left(new Error(`Validation failed: ${errorMessages}`));
  }

  return TE.right(result.data);
};

export const callAI = (
  params: unknown,
  userSystemPrompt?: string,
  apiKey?: string
): TE.TaskEither<Error, AIModelResponse> => {
  return pipe(
    validateRequestPayload(params),
    TE.chain(validatedParams => callAIModel(validatedParams, userSystemPrompt, apiKey))
  );
};

export const executeAICall = async (
  params: unknown,
  userSystemPrompt?: string,
  apiKey?: string
): Promise<{ success: true; data: AIModelResponse } | { success: false; error: Error }> => {
  const result = await callAI(params, userSystemPrompt, apiKey)();

  if (result._tag === 'Left') {
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
