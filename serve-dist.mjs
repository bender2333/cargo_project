import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { createServer } from 'node:http'

const host = '127.0.0.1'
const port = Number(process.env.PORT || 5173)
const distRoot = resolve('dist')

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function resolveAsset(url) {
  const parsedUrl = new URL(url, `http://${host}:${port}`)
  const requestedPath = decodeURIComponent(parsedUrl.pathname)
  const candidatePath = normalize(join(distRoot, requestedPath))

  if (!candidatePath.startsWith(distRoot)) {
    return null
  }

  if (existsSync(candidatePath) && statSync(candidatePath).isFile()) {
    return candidatePath
  }

  return join(distRoot, 'index.html')
}

const server = createServer((request, response) => {
  const filePath = resolveAsset(request.url || '/')

  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404)
    response.end('Not found')
    return
  }

  response.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
  })
  createReadStream(filePath).pipe(response)
})

server.listen(port, host, () => {
  console.log(`Local app running at http://${host}:${port}/`)
})
