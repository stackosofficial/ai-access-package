import axios from 'axios';
import { pipe } from 'fp-ts/function';
import * as TE from 'fp-ts/TaskEither';

import type { RequestPayload } from '../../../types/schemas';

export interface AIModelRequest {
  prompt: string;
  system_prompt?: string | string[];
  systemPrompt?: string;
  model?: string;
  response_format?: {
    type: 'json_object' | 'json_schema';
    schema: Record<string, unknown>;
  };
  apiKey?: string;
}

export interface AIModelResponse {
  success: boolean;
  content: string;
  error?: string;
}

const validateSystemPrompt = (systemPrompt?: string | string[]): TE.TaskEither<Error, void> => {
  if (!systemPrompt) {
    return TE.right(undefined);
  }

  const forbiddenKeywords = ['endpoint', 'route', 'api ', 'webhook', 'callback', 'wallet', 'address'];
  const prompts = Array.isArray(systemPrompt) ? systemPrompt : [systemPrompt];

  for (const prompt of prompts) {
    const lower = prompt.toLowerCase();
    const hit = forbiddenKeywords.find(k => lower.includes(k));

    if (hit) {
      return TE.left(new Error(`System prompt rejected due to security policy (contains: ${hit})`));
    }
  }

  return TE.right(undefined);
};

const callOpenRouterAPI = (requestData: AIModelRequest): TE.TaskEither<Error, AIModelResponse> => {
  return TE.tryCatch(
    async () => {
      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const systemPrompts: string[] = [];

          if (requestData.system_prompt) {
            if (Array.isArray(requestData.system_prompt)) {
              systemPrompts.push(...requestData.system_prompt);
            } else {
              systemPrompts.push(requestData.system_prompt);
            }
          }

          if (requestData.systemPrompt) {
            systemPrompts.push(requestData.systemPrompt);
          }

          const requestPayload: {
            prompt: string;
            model: string[];
            system_prompt?: string[];
            response_type?: string;
            response_schema?: Record<string, unknown>;
          } = {
            prompt: requestData.prompt,
            model: [requestData.model || 'Qwen/Qwen3-Next-80B-A3B-Thinking'],
          };

          if (systemPrompts.length > 0) {
            requestPayload.system_prompt = systemPrompts;
          }

          if (requestData.response_format) {
            requestPayload.response_type = 'json_schema';
            requestPayload.response_schema = requestData.response_format.schema;
          }

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };

          if (requestData.apiKey) {
            headers['x-api-key'] = requestData.apiKey;
          }

          const response = await axios({
            method: 'POST',
            url: 'https://skynetai-s1.stackos.io/api/ai',
            data: requestPayload,
            headers,
          });

          const responseData = response.data as { content?: string; data?: unknown; success?: boolean } | string;

          let content: string;

          if (typeof responseData === 'string') {
            content = responseData;
          } else if (
            responseData &&
            typeof responseData === 'object' &&
            'content' in responseData &&
            typeof responseData.content === 'string'
          ) {
            content = responseData.content;
          } else if (
            responseData &&
            typeof responseData === 'object' &&
            'data' in responseData &&
            responseData.data !== null &&
            responseData.data !== undefined
          ) {
            if (typeof responseData.data === 'string') {
              content = responseData.data;
            } else {
              content = JSON.stringify(responseData.data);
            }
          } else {
            content = JSON.stringify(responseData);
          }

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
