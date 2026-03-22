/** @fileoverview Type declarations for the parse-torrent library. */
declare module 'bencode' {
  function decode(data: Uint8Array | ArrayBuffer | Buffer | string): Record<string, unknown>
  function encode(data: Record<string, unknown>): Uint8Array
  export default { decode, encode }
}
