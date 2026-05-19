import { createServer } from 'vite'

async function main() {
  const server = await createServer({
    root: process.cwd(),
    server: {
      host: '127.0.0.1',
      port: 5173,
    },
  })

  await server.listen()
  server.printUrls()

  process.on('SIGINT', async () => {
    await server.close()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await server.close()
    process.exit(0)
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
