/** The data files, which the jsonc plugin of +config.ts turns into JSON modules. */
declare module "*.jsonc" {
  const value: unknown;
  export default value;
}
declare module "*.jsonc?search-words" {
  const value: import("./client-data.ts").SearchWords;
  export default value;
}
