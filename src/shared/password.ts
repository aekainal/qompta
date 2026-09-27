/**
 * Rules of the login password (same rules as QSSH's master password).
 *
 * Pure: shared by the forms (live checklist) and the main process, which checks
 * again before wrapping the key.
 */

export const MIN_PASSWORD_LENGTH = 10;

export type PasswordRule = "length" | "digit" | "letter" | "special";
export const PASSWORD_RULES: readonly PasswordRule[] = ["length", "digit", "letter", "special"];

/** Interface labels of the rules. */
export const PASSWORD_RULE_LABELS: Record<PasswordRule, string> = {
  length: `Au moins ${MIN_PASSWORD_LENGTH} caractères`,
  digit: "Au moins un chiffre",
  letter: "Au moins une lettre",
  special: "Au moins un caractère spécial, par exemple :",
};

/** Shown next to the rule; any character that is not a letter, digit or space counts. */
export const SPECIAL_CHARACTER_EXAMPLES: readonly string[] = [
  "!", "@", "#", "$", "%", "&",
  "*", "?", "-", "_", ".", ",",
  ";", ":", "+", "=", "/", "(",
];

/** Which rules a password meets (any script counts as a letter). */
export function passwordRules(password: string): Record<PasswordRule, boolean> {
  return {
    length: [...password].length >= MIN_PASSWORD_LENGTH,
    digit: /\p{Nd}/u.test(password),
    letter: /\p{L}/u.test(password),
    special: /[^\p{L}\p{N}\s]/u.test(password),
  };
}

export function isStrongPassword(password: string): boolean {
  return Object.values(passwordRules(password)).every(Boolean);
}
