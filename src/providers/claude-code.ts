import { spawn } from 'child_process'
import type { AIProvider, Message, ProviderOptions } from './types.js'

export class ClaudeCodeProvider implements AIProvider {
  name = 'claude-code'

  constructor(_options?: ProviderOptions) {
    // No API key needed for Claude Code CLI
  }

  async chat(messages: Message[], systemPrompt?: string): Promise<string> {
    const prompt = this.buildPrompt(messages, systemPrompt)
    return this.runClaude(prompt)
  }

  async *chatStream(messages: Message[], systemPrompt?: string): AsyncGenerator<string, void, unknown> {
    const prompt = this.buildPrompt(messages, systemPrompt)
    yield* this.runClaudeStream(prompt)
  }

  private buildPrompt(messages: Message[], systemPrompt?: string): string {
    let prompt = ''
    if (systemPrompt) {
      prompt += `System: ${systemPrompt}\n\n`
    }
    for (const msg of messages) {
      prompt += `${msg.role}: ${msg.content}\n\n`
    }
    return prompt
  }

  private runClaude(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('claude', ['-p', prompt], {
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let output = ''
      let error = ''

      child.stdout.on('data', (data) => {
        output += data.toString()
      })

      child.stderr.on('data', (data) => {
        error += data.toString()
      })

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${error}`))
        } else {
          resolve(output.trim())
        }
      })

      child.on('error', (err) => {
        reject(new Error(`Failed to run claude CLI: ${err.message}`))
      })
    })
  }

  private async *runClaudeStream(prompt: string): AsyncGenerator<string, void, unknown> {
    const child = spawn('claude', ['-p', prompt], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const chunks: string[] = []
    let resolveNext: ((value: { chunk: string | null }) => void) | null = null
    let done = false
    let error: Error | null = null

    child.stdout.on('data', (data) => {
      const chunk = data.toString()
      if (resolveNext) {
        resolveNext({ chunk })
        resolveNext = null
      } else {
        chunks.push(chunk)
      }
    })

    child.stderr.on('data', (_data) => {
      // Ignore stderr for now, claude CLI may output progress there
    })

    child.on('close', (code) => {
      done = true
      if (code !== 0) {
        error = new Error(`Claude CLI exited with code ${code}`)
      }
      if (resolveNext) {
        resolveNext({ chunk: null })
      }
    })

    child.on('error', (err) => {
      done = true
      error = new Error(`Failed to run claude CLI: ${err.message}`)
      if (resolveNext) {
        resolveNext({ chunk: null })
      }
    })

    while (!done || chunks.length > 0) {
      if (chunks.length > 0) {
        yield chunks.shift()!
      } else if (!done) {
        const result = await new Promise<{ chunk: string | null }>((resolve) => {
          resolveNext = resolve
        })
        if (result.chunk !== null) {
          yield result.chunk
        }
      }
    }

    if (error) {
      throw error
    }
  }
}
