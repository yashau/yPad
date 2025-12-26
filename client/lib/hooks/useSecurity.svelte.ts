/**
 * Security and encryption state management hook
 * Handles password protection and encryption state
 */

export function useSecurity() {
  let password = $state('');
  let passwordToSet = $state('');
  let passwordInput = $state('');
  let removePasswordInput = $state('');
  let passwordRequired = $state(false);
  let hasPassword = $state(false);
  let isEncrypted = $state(false);
  let passwordError = $state('');
  let removePasswordError = $state('');

  return {
    get password() { return password; },
    set password(value: string) { password = value; },

    get passwordToSet() { return passwordToSet; },
    set passwordToSet(value: string) { passwordToSet = value; },

    get passwordInput() { return passwordInput; },
    set passwordInput(value: string) { passwordInput = value; },

    get removePasswordInput() { return removePasswordInput; },
    set removePasswordInput(value: string) { removePasswordInput = value; },

    get passwordRequired() { return passwordRequired; },
    set passwordRequired(value: boolean) { passwordRequired = value; },

    get hasPassword() { return hasPassword; },
    set hasPassword(value: boolean) { hasPassword = value; },

    get isEncrypted() { return isEncrypted; },
    set isEncrypted(value: boolean) { isEncrypted = value; },

    get passwordError() { return passwordError; },
    set passwordError(value: string) { passwordError = value; },

    get removePasswordError() { return removePasswordError; },
    set removePasswordError(value: string) { removePasswordError = value; }
  };
}
