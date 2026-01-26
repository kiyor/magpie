# Magpie

Multi-AI adversarial PR review tool. Let different AI models review your code like Linus Torvalds, generating more comprehensive reviews through debate.

## Core Concepts

- **Same Perspective, Different Models**: All reviewers use the same prompt (Linus-style), but are powered by different AI models
- **Natural Adversarial**: Differences between models naturally create disagreements and debates
- **Anti-Sycophancy**: Explicitly tells AI they're debating with other AIs, preventing mutual agreement bias

## Supported AI Providers

| Provider | Description |
|----------|-------------|
| `claude-code` | Claude Code CLI (requires `claude` command) |
| `codex-cli` | OpenAI Codex CLI (requires `codex` command) |
| `gemini-*` | Google Gemini API (requires API Key) |
| `anthropic` | Anthropic API (requires API Key) |
| `openai` | OpenAI API (requires API Key) |

## Installation

```bash
# Clone the repo
git clone https://github.com/liliu-z/magpie.git
cd magpie

# Install dependencies
npm install

# Build
npm run build

# Global install (optional)
npm link
```

## Quick Start

```bash
# Initialize config file
magpie init

# Edit config
vim ~/.magpie/config.yaml

# Navigate to the repo you want to review
cd your-repo

# Start review
magpie review 12345
```

## Configuration

Config file is located at `~/.magpie/config.yaml`:

```yaml
# AI Providers config
providers:
  claude-code:
    enabled: true
  codex-cli:
    enabled: true
  google:
    api_key: YOUR_GEMINI_API_KEY

# Default settings
defaults:
  max_rounds: 2
  output_format: markdown
  check_convergence: true  # Stop early when consensus reached

# Reviewers - same perspective, different models
reviewers:
  claude:
    model: claude-code
    prompt: |
      You are a senior engineer reviewing this PR. Be direct and concise like Linus Torvalds,
      but constructive rather than harsh.

      Focus on:
      1. **Correctness** - Will this code work? Edge cases?
      2. **Security** - Any vulnerabilities? Input validation?
      3. **Architecture** - Does this fit the overall design? Any coupling issues?
      4. **Simplicity** - Is this the simplest solution? Over-engineering?

  codex:
    model: codex-cli
    prompt: |
      # Same as above...

# Analyzer - PR analysis (before debate)
analyzer:
  model: claude-code
  prompt: |
    You are a senior engineer providing PR context analysis.
    Analyze this PR and provide:
    1. What this PR does
    2. Architecture/design decisions
    3. Purpose
    4. Trade-offs
    5. Things to note

# Summarizer - final conclusion
summarizer:
  model: claude-code
  prompt: |
    You are a neutral technical reviewer. Based on the anonymous reviewer summaries, provide:
    1. Points of consensus
    2. Points of disagreement
    3. Recommended action items
    4. Overall assessment
```

## CLI Options

```bash
magpie review <pr-number> [options]

Options:
  -c, --config <path>   Path to config file
  -r, --rounds <number> Maximum debate rounds (default: 3)
  -i, --interactive     Interactive mode (pause between turns)
  -o, --output <file>   Output to file
  -f, --format <format> Output format (markdown|json)
  --no-converge         Disable convergence detection (enabled by default)
```

## Workflow

```
1. Analyzer analyzes PR
   ↓
2. Multi-round debate
   ├─ Reviewer 1 (Claude) gives feedback
   ├─ Reviewer 2 (Codex) responds and adds insights
   ├─ Reviewer 1 rebuts or agrees
   └─ ... (repeat until max rounds or convergence)
   ↓
3. Each Reviewer summarizes their points
   ↓
4. Summarizer produces final conclusion
```

## Features

### Convergence Detection

Enabled by default. Automatically ends debate when reviewers reach consensus on key points, saving tokens.

```bash
# Convergence detection enabled by default
magpie review 12345

# Disable convergence detection
magpie review 12345 --no-converge
```

Set `defaults.check_convergence: false` in config to disable by default.

### Token Usage Tracking

Displays token usage and estimated cost after each review:

```
=== Token Usage (Estimated) ===
  analyzer: 1,234 in / 567 out
  claude: 2,345 in / 890 out
  codex: 2,456 in / 912 out
  summarizer: 3,456 in / 234 out
  Total: 9,491 in / 2,603 out (~$0.1209)
```

### Interactive Mode

Use `-i` to enter interactive mode, allowing you to inject your own opinions during the debate:

```bash
magpie review 12345 -i
```

## Development

```bash
# Run in dev mode
npm run dev -- review 12345

# Run tests
npm test

# Build
npm run build
```

## License

ISC
