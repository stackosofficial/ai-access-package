import axios from 'axios';
import { pipe } from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';

import type { RequestPayload } from '../../../types/schemas';

export interface AIModelRequest {
  prompt: string;
  system_prompt?: string;
  model?: string;
}

export interface AIModelResponse {
  success: boolean;
  content: string;
  error?: string;
}

/**
 * Security validation: prevent unsafe system prompts from overriding rules
 */
const validateSystemPrompt = (systemPrompt?: string): TE.TaskEither<Error, void> => {
  if (!systemPrompt) {
    return TE.right(undefined);
  }

  const forbiddenKeywords = ['endpoint', 'route', 'api ', 'webhook', 'callback', 'wallet', 'address'];

  const lower = systemPrompt.toLowerCase();
  const hit = forbiddenKeywords.find(k => lower.includes(k));

  if (hit) {
    return TE.left(new Error(`System prompt rejected due to security policy (contains: ${hit})`));
  }

  return TE.right(undefined);
};

/**
 * Call OpenRouter API endpoint
 */
const callOpenRouterAPI = (requestData: AIModelRequest): TE.TaskEither<Error, AIModelResponse> => {
  return TE.tryCatch(
    async () => {
      const response = await axios({
        method: 'POST',
        url: 'https://openrouter-c0n623.stackos.io/natural-request',
        data: {
          ...requestData,
          model: requestData.model || 'Qwen/Qwen3-Next-80B-A3B-Thinking',
        },
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Transform response to our format
      const responseData = response.data as { content?: string };
      const content =
        typeof responseData === 'object' &&
        responseData !== null &&
        'content' in responseData &&
        typeof responseData.content === 'string'
          ? responseData.content
          : JSON.stringify(responseData);
      return {
        success: true,
        content,
      };
    },
    error => {
      const message = error instanceof Error ? error.message : 'Unknown error calling AI model';
      return new Error(`AI Model API error: ${message}`);
    }
  );
};

/**
 * Main domain function: Call AI model with validation
 */
export const callAIModel = (params: RequestPayload): TE.TaskEither<Error, AIModelResponse> => {
  return pipe(
    validateSystemPrompt(params.system_prompt),
    TE.chain(() =>
      callOpenRouterAPI({
        prompt: params.prompt,
        system_prompt: params.system_prompt,
      })
    )
  );
};
