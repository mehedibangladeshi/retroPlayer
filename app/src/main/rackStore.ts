// The cassette rack on disk (rack.json under userData) and spine images made from album covers.
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, nativeImage } from 'electron'
import type { Album } from '@shared/protocol'
import type { AlbumCustom } from '@shared/rack'
import { hexRgb, inkFor, meanRgb, nameColor, parseRack, spineCrop, spineText, type RackFile, type SpineBase } from './rack'

const SPINE_HEIGHT = 400

const rackPath = (): string => join(app.getPath('userData'), 'rack.json')

export function loadRack(): RackFile {
  let raw: unknown = null
  try {
    raw = JSON.parse(readFileSync(rackPath(), 'utf8'))
  } catch {
    // missing or corrupt: start empty
  }
  return parseRack(raw)
}

export function saveRack(f: RackFile): void {
  try {
    const file = rackPath()
    const tmp = file + '.tmp'
    writeFileSync(tmp, JSON.stringify(f))
    renameSync(tmp, file) // atomic replace: a crash mid-write never leaves a half-written rack.json
  } catch (err) {
    console.warn('[main] could not save rack', err)
  }
}

/** custom.cover is applied by the caller as coverDataUrl; custom.spineColor makes a solid spine. */
export function makeSpine(album: Album, custom?: AlbumCustom, coverDataUrl?: string): SpineBase {
  const text = custom?.text ?? spineText(album)
  const cover = coverDataUrl ?? album.cover
  const solid = custom?.spineColor
  const ink = (rgb: [number, number, number]): string => custom?.ink ?? inkFor(rgb)
  if (solid) return { dir: album.dir, text, image: null, bg: solid, ink: ink(hexRgb(solid)) }
  if (cover) {
    try {
      const img = nativeImage.createFromDataURL(cover)
      if (!img.isEmpty()) {
        const { width, height } = img.getSize()
        let strip = img.crop(spineCrop(width, height, custom?.spineOffset))
        const rgb = meanRgb(strip.toBitmap())
        if (strip.getSize().height > SPINE_HEIGHT) strip = strip.resize({ height: SPINE_HEIGHT, quality: 'good' })
        const hex = '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('')
        return { dir: album.dir, text, image: 'data:image/jpeg;base64,' + strip.toJPEG(82).toString('base64'), bg: hex, ink: ink(rgb) }
      }
    } catch (err) {
      console.warn('[main] spine image failed, using a plain spine', err)
    }
  }
  const bg = nameColor(text)
  return { dir: album.dir, text, image: null, bg, ink: ink(hexRgb(bg)) }
}
