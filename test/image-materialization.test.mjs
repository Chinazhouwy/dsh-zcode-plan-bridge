/**
 * Image materialisation: DSH image blocks must reach the agent as local files the
 * Read tool accepts. The agent keys the file type off the extension and refuses
 * extension-less binaries, which is exactly what the zero-copy host path returns
 * (the persistent store object is a bare content hash).
 *
 * Run: node --test test/
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { materializeImages, removeFiles } from '../lib/messages.js'

test('a zero-copy host path without an extension is copied to a temp file that names the format', async () => {
  const storeObject = path.join(os.tmpdir(), `zcode-img-fixture-${process.pid}.bin`)
  // WebP magic (RIFF....WEBP) so the bytes are a real image payload.
  fs.writeFileSync(storeObject, Buffer.concat([Buffer.from('RIFF0000WEBPVP8 '), Buffer.alloc(64)]))
  try {
    const block = { type: 'image', attachment: { attachmentId: 'sha256:fixture', mediaType: 'image/webp', width: 8, height: 8 } }
    const attachments = { imageHostPath: () => storeObject, readImage: async () => { throw Error('must not be called when a host path exists') } }
    const ctx = await materializeImages([{ role: 'user', content: [block] }], { attachments })
    try {
      assert.equal(ctx.files.length, 1)
      assert.ok(ctx.files[0].endsWith('.webp'), `expected a .webp temp file, got ${ctx.files[0]}`)
      assert.deepEqual(fs.readFileSync(ctx.files[0]), fs.readFileSync(storeObject), 'the copy must be byte-identical')
      assert.equal(ctx.imageText.get(block), '[图片 #1]')
    } finally {
      removeFiles(ctx.tempFiles)
    }
  } finally {
    fs.rmSync(storeObject, { force: true })
  }
})

test('a host path that already names the image format stays zero-copy', async () => {
  const block = { type: 'image', attachment: { attachmentId: 'sha256:fixture', mediaType: 'image/png' } }
  const attachments = { imageHostPath: () => '/host/real-image.png' }
  const ctx = await materializeImages([{ role: 'user', content: [block] }], { attachments })
  assert.deepEqual(ctx.files, ['/host/real-image.png'])
  assert.equal(ctx.tempFiles.length, 0)
})

test('without a host path the fallback still writes the media type extension', async () => {
  const block = { type: 'image', attachment: { attachmentId: 'sha256:fixture', mediaType: 'image/png' } }
  const attachments = { imageHostPath: () => undefined, readImage: async (ref) => ({ ref, data: new Uint8Array([0x89, 0x50]) }) }
  const ctx = await materializeImages([{ role: 'user', content: [block] }], { attachments })
  try {
    assert.equal(ctx.files.length, 1)
    assert.ok(ctx.files[0].endsWith('.png'), `expected a .png temp file, got ${ctx.files[0]}`)
  } finally {
    removeFiles(ctx.tempFiles)
  }
})
