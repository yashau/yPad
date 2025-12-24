/// <reference types="@cloudflare/workers-types" />

export {};

declare global {
  interface Env {
    DB: D1Database;
  }
}

declare module 'fast-diff' {
  const INSERT = 1;
  const DELETE = -1;
  const EQUAL = 0;

  function diff(text1: string, text2: string): Array<[number, string]>;

  namespace diff {
    export { INSERT, DELETE, EQUAL };
  }

  export default diff;
}
