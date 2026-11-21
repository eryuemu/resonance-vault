const { open } = require('node:fs/promises');
const { extname } = require('node:path');
const { Readable } = require('node:stream');

const mediaTypes = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif'
};

async function serveMedia(filename, request) {
  const mime = mediaTypes[extname(filename).slice(1).toLowerCase()];
  if (typeof mime !== 'string') return new Response(null, { status: 415 });
  const file = await open(filename, 'r').catch(() => null);
  if (!file) return new Response(null, { status: 404 });

  let streaming = false;
  try {
    const { size } = await file.stat();
    const headers = new Headers({
      'Content-Type': mime,
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes'
    });
    const range = request.headers.get('range');
    let start = 0;
    let end = size - 1;
    let status = 200;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match?.[1]) {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      } else if (match?.[2]) {
        start = Math.max(0, size - Number(match[2]));
      } else {
        start = size;
      }
      if (start >= size || start > end) {
        headers.set('Content-Range', `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
      status = 206;
    }
    headers.set('Content-Length', String(end - start + 1));
    if (request.method === 'HEAD' || size === 0) return new Response(null, { status, headers });
    const body = Readable.toWeb(file.createReadStream({ start, end, signal: request.signal }));
    streaming = true;
    return new Response(body, { status, headers });
  } finally {
    if (!streaming) await file.close();
  }
}

module.exports = { serveMedia };
