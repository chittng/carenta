import { zodResolver } from '@hookform/resolvers/zod';
import {
  type FieldValues,
  type Path,
  useForm,
  type UseFormProps,
  type UseFormSetError,
} from 'react-hook-form';
import { type z } from 'zod';

import { ErrorCode } from '@carenta/shared';

import { ApiRequestError } from './api/errors';

/**
 * `useForm` validated by a zod schema from `@carenta/shared`, the same one the API checks.
 * Field values are the schema's input; `handleSubmit` receives its parsed output (trimmed,
 * lowercased emails and so on), which is what should be sent to the API.
 */
export function useZodForm<Input extends FieldValues, Output extends FieldValues>(
  schema: z.ZodType<Output, Input>,
  props?: Omit<UseFormProps<Input, unknown, Output>, 'resolver'> & {
    /**
     * Messages for fields left empty, by path (e.g. `{ modelId: 'Vui lòng chọn dòng xe.' }`).
     * Empty number and select inputs reach zod as null/undefined, whose default messages
     * ("mong đợi số, nhận được undefined") mean nothing to users.
     */
    requiredMessages?: Partial<Record<string, string>>;
  },
) {
  const { requiredMessages, ...formProps } = props ?? {};
  return useForm<Input, unknown, Output>({
    mode: 'onTouched',
    ...formProps,
    // Explicit type arguments pick the zod 4 overload; inference lands on the zod 3 one.
    resolver: zodResolver<Input, unknown, Output, z.ZodType<Output, Input>>(schema, {
      error: (issue) => emptyFieldMessage(issue, requiredMessages),
    }),
  });
}

/** The message for a field left empty, or undefined to keep zod's own message. */
export function emptyFieldMessage(
  issue: { code?: string; input?: unknown; path?: PropertyKey[] },
  messages: Partial<Record<string, string>> = {},
): string | undefined {
  const empty = issue.input === undefined || issue.input === null;
  if (!empty || (issue.code !== 'invalid_type' && issue.code !== 'invalid_value')) return undefined;
  const path = (issue.path ?? []).map(String).join('.');
  return messages[path] ?? 'Vui lòng điền mục này.';
}

/** Where errors not tied to a field go; render `formState.errors.root?.server?.message`. */
export const SERVER_ERROR_FIELD = 'root.server';

/**
 * Shows an API error on the form: each `VALIDATION_FAILED` detail on its field (the API
 * reports paths like `pricing.weekdayPrice`, the same as react-hook-form's), anything else on
 * `root.server` unless `codeFields` names a field for its code. Use with
 * `meta: { errorToast: false }` on the mutation.
 *
 * Returns whether the error was an API error; other errors are left to the caller.
 */
export function applyApiError<Values extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<Values>,
  fields: readonly Path<Values>[],
  /** Business errors that belong to one field, e.g. `{ EMAIL_TAKEN: 'email' }`. */
  codeFields: Partial<Record<string, Path<Values>>> = {},
): boolean {
  if (!(error instanceof ApiRequestError)) return false;

  const codeField = codeFields[error.code];
  if (codeField) {
    setError(codeField, { type: 'server', message: error.message }, { shouldFocus: true });
    return true;
  }

  const details = error.code === ErrorCode.VALIDATION_FAILED ? error.details : [];
  const unplaced: string[] = [];
  let placed = false;
  for (const detail of details) {
    const field = fields.find((name) => name === detail.path);
    if (field) {
      setError(field, { type: 'server', message: detail.message }, { shouldFocus: !placed });
      placed = true;
    } else {
      unplaced.push(detail.message);
    }
  }
  if (!placed || unplaced.length > 0) {
    const message = unplaced.length > 0 ? unplaced.join(' ') : error.message;
    setError(SERVER_ERROR_FIELD, { type: 'server', message });
  }
  return true;
}
