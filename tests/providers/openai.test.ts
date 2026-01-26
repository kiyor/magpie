import { describe, it, expect, vi } from 'vitest'
import { OpenAIProvider } from '../../src/providers/openai'

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Mock response' } }]
        })
      }
    }
  }
}))

describe('OpenAIProvider', () => {
  it('should have correct name', () => {
    const provider = new OpenAIProvider({ apiKey: 'test', model: 'gpt-4o' })
    expect(provider.name).toBe('openai')
  })

  it('should call chat and return response', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test', model: 'gpt-4o' })
    const result = await provider.chat([{ role: 'user', content: 'Hello' }])
    expect(result).toBe('Mock response')
  })
})
