import { type ENVDefinition, envDefinitionSchema } from '../types/types';

export default class ENVConfig {
  env: ENVDefinition;

  constructor(env: unknown) {
    // Validate environment configuration with Zod
    this.env = envDefinitionSchema.parse(env);
  }
}
