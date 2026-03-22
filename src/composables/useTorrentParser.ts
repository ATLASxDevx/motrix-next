/** @fileoverview Utility for parsing .torrent files into structured metadata and computing infoHash. */

interface BencodeInfo extends Record<string, unknown> {
  name?: Uint8Array
  'name.utf-8'?: Uint8Array
  files?: {
    path?: Uint8Array[]
    'path.utf-8'?: Uint8Array[]
    length?: number
  }[]
  length?: number
}

interface BencodeTorrent {
  info?: BencodeInfo
  'creation date'?: number
}

/** A single file entry parsed from a .torrent. */
export interface TorrentFile {
  idx: number
  path: string
  length: number
}

/** Result of parsing a .torrent file. */
export interface TorrentMeta {
  infoHash: string
  files: TorrentFile[]
}

/** Decodes a bencode name (Uint8Array or string) to a UTF-8 string. */
function decodeName(v: Uint8Array | string): string {
  return v instanceof Uint8Array ? new TextDecoder('utf-8', { fatal: false }).decode(v) : String(v)
}

/**
 * Parse a .torrent file (as Uint8Array) into a typed TorrentMeta.
 * Extracts the SHA-1 infoHash and file list.
 */
export async function parseTorrentBuffer(
  uint8: Uint8Array,
  bencode: {
    decode: (data: Uint8Array | ArrayBuffer | Buffer | string) => Record<string, unknown>
    encode: (data: Record<string, unknown>) => Uint8Array
  },
): Promise<TorrentMeta | null> {
  const decoded = bencode.decode(uint8) as BencodeTorrent
  const info = decoded.info
  if (!info) return null

  // Compute SHA-1 infoHash
  const infoBytes = bencode.encode(info)
  const hashBuffer = await crypto.subtle.digest('SHA-1', new Uint8Array(infoBytes).buffer as ArrayBuffer)
  const infoHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  let files: TorrentFile[]
  if (info.files && info.files.length > 0) {
    files = info.files.map((f, i) => {
      const pathParts = ((f.path || f['path.utf-8'] || []) as (Uint8Array | string)[]).map(decodeName)
      return {
        idx: i + 1,
        path: pathParts.join('/') || `file-${i + 1}`,
        length: Number(f.length) || 0,
      }
    })
  } else if (info.name) {
    files = [
      {
        idx: 1,
        path: decodeName((info['name.utf-8'] || info.name) as Uint8Array | string),
        length: Number(info.length) || 0,
      },
    ]
  } else {
    files = []
  }

  return { infoHash, files }
}

/** Converts a Uint8Array to a base64 string for transmission. */
export function uint8ToBase64(uint8: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i])
  }
  return btoa(binary)
}
