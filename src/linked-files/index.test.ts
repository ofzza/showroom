/**
 * Tests of the linked files' paths, text detection and highlighting language
 */

import { describe, it, expect } from 'vitest';
import { getLanguage, getLinkedFileUrl, isText, LINKED_FILE_MODAL_LIMIT, LINKED_FILES_FOLDER } from './index.js';

describe('linked-files', () => {
  // Tests the Node-free helpers on hand-written paths and bytes.

  it("Gets a linked file's URL in the linked files' folder, each segment encoded", () => {
    expect(LINKED_FILES_FOLDER).toBe('files');
    expect(getLinkedFileUrl('src/index.ts')).toBe('files/src/index.ts');
    expect(getLinkedFileUrl('docs/my notes/#1?.txt')).toBe('files/docs/my%20notes/%231%3F.txt');
  });

  it('Limits the modal to 1 MB', () => {
    expect(LINKED_FILE_MODAL_LIMIT).toBe(1024 * 1024);
  });

  it('Tells text from binary content', () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    expect(isText(encode('Plain text\n'))).toBe(true);
    expect(isText(encode('Čćžšđ, 日本語, 🙂'))).toBe(true);
    expect(isText(new Uint8Array())).toBe(true);
    // A NUL byte is valid UTF-8, but no text file holds one
    expect(isText(encode('a\0b'))).toBe(false);
    expect(isText(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(isText(new Uint8Array([0x63, 0xe8, 0x61]))).toBe(false);
  });

  it('Gets the language from the extension, or the name when it has none', () => {
    expect(getLanguage('src/index.ts')).toBe('ts');
    expect(getLanguage('docs/Guide.MD')).toBe('md');
    expect(getLanguage('archive.tar.gz')).toBe('gz');
    expect(getLanguage('Makefile')).toBe('makefile');
    expect(getLanguage('build/Dockerfile')).toBe('dockerfile');
    expect(getLanguage('.env')).toBe('.env');
  });
});
