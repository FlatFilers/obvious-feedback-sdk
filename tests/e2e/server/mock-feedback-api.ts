import { createServer } from 'node:http'

const PORT = 4444

let lastSubmission: Record<string, unknown> | null = null
let issueCounter = 0

function jsonResponse(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(JSON.stringify(body))
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  if (req.method === 'POST' && url.pathname === '/prepare/v1/feedback/submit') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      issueCounter += 1
      lastSubmission = JSON.parse(body)
      jsonResponse(res, 200, {
        success: true,
        data: {
          issueId: `abi_mock_${issueCounter}`,
          status: 'received',
          issueUrl: `https://app.obvious.ai/autobuild?issueId=abi_mock_${issueCounter}`,
        },
      })
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/prepare/v1/feedback/submit-round') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      issueCounter += 1
      lastSubmission = JSON.parse(body)
      jsonResponse(res, 200, {
        success: true,
        data: {
          issueId: `abi_mock_${issueCounter}`,
          status: 'received',
          issueUrl: `https://app.obvious.ai/autobuild?issueId=abi_mock_${issueCounter}`,
        },
      })
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/prepare/v1/feedback/attachments/upload') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      jsonResponse(res, 200, {
        success: true,
        data: {
          uploadUrl: 'https://s3.mock.test/upload-1',
          attachmentToken: 'mock_attachment_token_1',
        },
      })
    })
    return
  }

  if (req.method === 'GET' && url.pathname.startsWith('/prepare/v1/feedback/status/')) {
    const issueId = url.pathname.split('/').pop()
    jsonResponse(res, 200, {
      success: true,
      data: {
        issueId,
        status: 'in_progress',
        triageStatus: 'triaged',
        title: 'Mock issue title',
        description: 'Mock issue description',
        resolvedNote: null,
        reportedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/_test/last-submission') {
    jsonResponse(res, 200, { data: lastSubmission })
    return
  }

  jsonResponse(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => {
  console.log(`Mock feedback API running on http://localhost:${PORT}`)
})

export { server, PORT }
