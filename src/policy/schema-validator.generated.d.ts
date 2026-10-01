import type { ErrorObject } from "ajv";

interface CompiledValidator {
  (data: unknown): boolean;
  errors?: ErrorObject[] | null;
}

declare const validate: CompiledValidator;
export { validate };
export default validate;
