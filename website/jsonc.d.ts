/** The data files, which the jsonc plugin of +config.ts turns into JSON modules. */
declare module "*.jsonc" {
  const value: unknown;
  export default value;
}
