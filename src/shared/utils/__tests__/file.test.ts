/** @fileoverview Tests for file utilities: selection, filtering, extension parsing, and torrent detection. */
import { describe, it, expect } from 'vitest'
import {
  getFileName,
  getFileExtension,
  removeExtensionDot,
  isTorrent,
  getFileSelection,
  listTorrentFiles,
  buildFileList,
  filterVideoFiles,
  filterAudioFiles,
  filterImageFiles,
  filterDocumentFiles,
  isAudioOrVideo,
} from '../file'
import type { Aria2File, EnrichedFile } from '@shared/types'

function createMockFile(overrides: Partial<Aria2File> = {}): Aria2File {
  return {
    index: '1',
    path: '/tmp/test.txt',
    length: '1000',
    completedLength: '500',
    selected: 'true',
    uris: [],
    ...overrides,
  }
}

function createEnrichedFile(extension: string, overrides: Partial<EnrichedFile> = {}): EnrichedFile {
  return {
    index: '1',
    path: `/tmp/file${extension}`,
    length: '1000',
    completedLength: '500',
    selected: 'true',
    uris: [],
    extension,
    ...overrides,
  }
}

// ─── getFileName ─────────────────────────────────────────────

describe('getFileName', () => {
  it('extracts filename from unix path', () => {
    expect(getFileName('/home/user/file.txt')).toBe('file.txt')
  })

  it('extracts filename from windows path', () => {
    expect(getFileName('C:\\Users\\file.txt')).toBe('file.txt')
  })

  it('returns full string when no path separators', () => {
    expect(getFileName('file.txt')).toBe('file.txt')
  })

  it('handles empty string', () => {
    expect(getFileName('')).toBe('')
  })

  it('handles trailing separator', () => {
    expect(getFileName('/path/to/dir/')).toBe('')
  })
})

// ─── getFileExtension ────────────────────────────────────────

describe('getFileExtension', () => {
  it('extracts extension from standard filename', () => {
    expect(getFileExtension('file.txt')).toBe('txt')
  })

  it('extracts last extension from compound', () => {
    expect(getFileExtension('archive.tar.gz')).toBe('gz')
  })

  it('returns empty for no extension', () => {
    expect(getFileExtension('README')).toBe('')
  })

  it('returns empty for dotfile (leading dot is not an extension)', () => {
    // The bitwise trick (lastIndexOf('.') - 1) >>> 0 treats position 0 as no-extension
    expect(getFileExtension('.gitignore')).toBe('')
  })

  it('handles empty string', () => {
    expect(getFileExtension('')).toBe('')
  })
})

// ─── removeExtensionDot ─────────────────────────────────────

describe('removeExtensionDot', () => {
  it('removes leading dot', () => {
    expect(removeExtensionDot('.txt')).toBe('txt')
  })

  it('returns unchanged when no dot present', () => {
    expect(removeExtensionDot('txt')).toBe('txt')
  })

  it('returns empty for empty string', () => {
    expect(removeExtensionDot('')).toBe('')
  })

  it('removes only the first dot', () => {
    expect(removeExtensionDot('.tar.gz')).toBe('tar.gz')
  })
})

// ─── isTorrent ──────────────────────────────────────────────

describe('isTorrent', () => {
  it('detects .torrent extension', () => {
    expect(isTorrent({ name: 'ubuntu.torrent', type: '' })).toBe(true)
  })

  it('detects by MIME type', () => {
    expect(isTorrent({ name: 'file', type: 'application/x-bittorrent' })).toBe(true)
  })

  it('rejects non-torrent files', () => {
    expect(isTorrent({ name: 'archive.zip', type: 'application/zip' })).toBe(false)
  })

  it('rejects empty name and type', () => {
    expect(isTorrent({ name: '', type: '' })).toBe(false)
  })
})

// ─── getFileSelection ───────────────────────────────────────

describe('getFileSelection', () => {
  it('returns "none" for empty array', () => {
    expect(getFileSelection([])).toBe('none')
  })

  it('returns "none" when no files are selected', () => {
    const files = [createMockFile({ index: '1', selected: 'false' }), createMockFile({ index: '2', selected: 'false' })]
    expect(getFileSelection(files)).toBe('none')
  })

  it('returns "all" when every file is selected', () => {
    const files = [createMockFile({ index: '1', selected: 'true' }), createMockFile({ index: '2', selected: 'true' })]
    expect(getFileSelection(files)).toBe('all')
  })

  it('returns selected file indices for partial selection', () => {
    const files = [
      createMockFile({ index: '1', selected: 'true' }),
      createMockFile({ index: '2', selected: 'false' }),
      createMockFile({ index: '3', selected: 'true' }),
    ]
    const result = getFileSelection(files)
    // aria2 uses 1-based indices; only selected files should be included.
    expect(result).toBe('1,3')
  })
})

// ─── listTorrentFiles ───────────────────────────────────────

describe('listTorrentFiles', () => {
  it('adds 1-based idx and dot-prefixed extension to each file', () => {
    const files = [
      createMockFile({ path: '/tmp/video.mp4' }),
      createMockFile({ index: '2', path: '/tmp/subtitle.srt' }),
    ]
    const result = listTorrentFiles(files)
    expect(result).toHaveLength(2)
    expect(result[0].idx).toBe(1)
    expect(result[0].extension).toBe('.mp4')
    expect(result[1].idx).toBe(2)
    expect(result[1].extension).toBe('.srt')
  })

  it('produces dot-only extension for files without extension', () => {
    const files = [createMockFile({ path: '/tmp/README' })]
    const result = listTorrentFiles(files)
    expect(result[0].extension).toBe('.')
  })

  it('returns empty for empty input', () => {
    expect(listTorrentFiles([])).toEqual([])
  })

  it('preserves original file properties via spread', () => {
    const file = createMockFile({ path: '/tmp/data.csv', length: '5000' })
    const result = listTorrentFiles([file])
    expect(result[0].length).toBe('5000')
    expect(result[0].path).toBe('/tmp/data.csv')
  })
})

// ─── buildFileList ──────────────────────────────────────────

describe('buildFileList', () => {
  it('returns single-element array with expected metadata structure', () => {
    const raw = new File(['hello'], 'test.txt', { type: 'text/plain' })
    const result = buildFileList(raw)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('test.txt')
    expect(result[0].status).toBe('ready')
    expect(result[0].percentage).toBe(0)
    expect(result[0].size).toBe(5)
    expect(typeof result[0].uid).toBe('number')
    expect(result[0].uid).toBeGreaterThan(0)
    expect(result[0].raw).toBe(raw)
  })
})

// ─── filterVideoFiles ───────────────────────────────────────

describe('filterVideoFiles', () => {
  it('matches video suffixes', () => {
    const files = [createEnrichedFile('.mp4'), createEnrichedFile('.mkv')]
    expect(filterVideoFiles(files)).toHaveLength(2)
  })

  it('also matches subtitle suffixes', () => {
    // SUB_SUFFIXES are included in filterVideoFiles
    const files = [createEnrichedFile('.srt'), createEnrichedFile('.ass')]
    expect(filterVideoFiles(files)).toHaveLength(2)
  })

  it('rejects non-video files', () => {
    expect(filterVideoFiles([createEnrichedFile('.zip')])).toEqual([])
  })

  it('returns empty for empty input', () => {
    expect(filterVideoFiles([])).toEqual([])
  })
})

// ─── filterAudioFiles ───────────────────────────────────────

describe('filterAudioFiles', () => {
  it('matches audio suffixes', () => {
    const files = [createEnrichedFile('.mp3'), createEnrichedFile('.flac')]
    expect(filterAudioFiles(files)).toHaveLength(2)
  })

  it('rejects non-audio files', () => {
    expect(filterAudioFiles([createEnrichedFile('.zip')])).toEqual([])
  })

  it('returns empty for empty input', () => {
    expect(filterAudioFiles([])).toEqual([])
  })
})

// ─── filterImageFiles ───────────────────────────────────────

describe('filterImageFiles', () => {
  it('matches image suffixes', () => {
    const files = [createEnrichedFile('.jpg'), createEnrichedFile('.png')]
    expect(filterImageFiles(files)).toHaveLength(2)
  })

  it('rejects non-image files', () => {
    expect(filterImageFiles([createEnrichedFile('.zip')])).toEqual([])
  })

  it('returns empty for empty input', () => {
    expect(filterImageFiles([])).toEqual([])
  })
})

// ─── filterDocumentFiles ────────────────────────────────────

describe('filterDocumentFiles', () => {
  it('matches document suffixes', () => {
    // DOCUMENT_SUFFIXES includes .pdf, .doc, .txt, .csv, etc.
    const files = [createEnrichedFile('.pdf'), createEnrichedFile('.docx')]
    expect(filterDocumentFiles(files)).toHaveLength(2)
  })

  it('rejects non-document files', () => {
    expect(filterDocumentFiles([createEnrichedFile('.zip')])).toEqual([])
  })

  it('returns empty for empty input', () => {
    expect(filterDocumentFiles([])).toEqual([])
  })
})

// ─── isAudioOrVideo ─────────────────────────────────────────

describe('isAudioOrVideo', () => {
  it('returns true for video URI', () => {
    expect(isAudioOrVideo('http://cdn.example.com/movie.mp4')).toBe(true)
  })

  it('returns true for audio URI', () => {
    expect(isAudioOrVideo('http://cdn.example.com/track.mp3')).toBe(true)
  })

  it('returns false for non-media URI', () => {
    expect(isAudioOrVideo('http://cdn.example.com/archive.zip')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isAudioOrVideo('')).toBe(false)
  })

  it('returns false for default parameter', () => {
    expect(isAudioOrVideo()).toBe(false)
  })
})
