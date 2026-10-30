import { ValidateBy, type ValidationOptions } from 'class-validator';

// PostgreSQL text columns cannot store the NUL character (\u0000); without
// this check such input reaches the database and fails there.
export function NoNullCharacters(options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'noNullCharacters',
      validator: {
        validate: (value) =>
          typeof value !== 'string' || !value.includes('\u0000'),
        defaultMessage: (args) =>
          `${args?.property} must not contain NUL (\\u0000) characters`,
      },
    },
    options,
  );
}
