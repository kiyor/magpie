// src/config/loader.ts
import { readFileSync, existsSync } from 'fs'
import { parse } from 'yaml'
import { homedir } from 'os'
import { join } from 'path'
import type { MagpieConfig } from './types.js'

export function expandEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, envVar) => {
    return process.env[envVar] || ''
  })
}

function expandEnvVarsInObject(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return expandEnvVars(obj)
  }
  if (Array.isArray(obj)) {
    return obj.map(expandEnvVarsInObject)
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandEnvVarsInObject(value)
    }
    return result
  }
  return obj
}

export function getConfigPath(customPath?: string): string {
  if (customPath) {
    return customPath
  }
  return join(homedir(), '.magpie', 'config.yaml')
}

export function loadConfig(configPath?: string): MagpieConfig {
  const path = getConfigPath(configPath)

  if (!existsSync(path)) {
    throw new Error(`Config file not found: ${path}`)
  }

  const content = readFileSync(path, 'utf-8')
  const parsed = parse(content)
  const expanded = expandEnvVarsInObject(parsed) as MagpieConfig

  return expanded
}
