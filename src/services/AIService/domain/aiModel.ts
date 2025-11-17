import axios from 'axios';
import { pipe } from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';

import type { RequestPayload } from '../../../types/schemas';

export interface AIModelRequest {
  prompt: string;
  system_prompt?: string;
  systemPrompt?: string;
  model?: string;
  response_format?: {
    type: 'json_object';
    schema: Record<string, unknown>;
  };
  apiKey?: string;
}

export interface AIModelResponse {
  success: boolean;
  content: string;
  error?: string;
}

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

const callOpenRouterAPI = (requestData: AIModelRequest): TE.TaskEither<Error, AIModelResponse> => {
  return TE.tryCatch(
    async () => {
      const messages: Array<{ role: string; content: string }> = [];

      if (requestData.system_prompt) {
        messages.push({
          role: 'system',
          content: requestData.system_prompt,
        });
      }

      if (requestData.systemPrompt) {
        messages.push({
          role: 'system',
          content: requestData.systemPrompt,
        });
      }

      messages.push({
        role: 'user',
        content: requestData.prompt,
      });

      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const requestPayload: {
            messages: Array<{ role: string; content: string }>;
            model: string;
            response_format?: {
              type: 'json_object';
              schema: Record<string, unknown>;
            };
          } = {
            messages,
            model: requestData.model || 'Qwen/Qwen3-Next-80B-A3B-Thinking',
          };

          if (requestData.response_format) {
            requestPayload.response_format = requestData.response_format;
          }

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };

          if (requestData.apiKey) {
            headers['x-api-key'] = requestData.apiKey;
          }

          const response = await axios({
            method: 'POST',
            url: 'https://openrouter-c0n623.stackos.io/natural-request',
            data: requestPayload,
            headers,
          });

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
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Unknown error calling AI model');

          if (attempt === maxRetries) {
            throw lastError;
          }

          const delayMs = Math.pow(2, attempt - 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      throw lastError || new Error('AI Model API error: Failed after retries');
    },
    error => {
      const message = error instanceof Error ? error.message : 'Unknown error calling AI model';
      return new Error(`AI Model API error: ${message}`);
    }
  );
};

export const callAIModel = (
  params: RequestPayload,
  userSystemPrompt?: string,
  apiKey?: string
): TE.TaskEither<Error, AIModelResponse> => {
  return pipe(
    validateSystemPrompt(params.system_prompt),
    TE.chain(() => validateSystemPrompt(userSystemPrompt)),
    TE.chain(() =>
      callOpenRouterAPI({
        prompt: params.prompt,
        system_prompt: params.system_prompt,
        systemPrompt: userSystemPrompt,
        response_format: params.response_format,
        apiKey,
      })
    )
  );
};
