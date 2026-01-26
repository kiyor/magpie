# Magpie

Multi-AI adversarial PR review tool. Multiple AI reviewers debate your PR from different perspectives.

## Installation

```bash
npm install -g magpie
```

## Quick Start

1. Initialize configuration:
```bash
magpie init
```

2. Edit `~/.magpie/config.yaml` with your API keys

3. Review a PR:
```bash
cd your-repo
magpie review 123
```

## Usage

```bash
# Basic review
magpie review <pr-number>

# Interactive mode (pause between turns)
magpie review 123 --interactive

# Custom rounds
magpie review 123 --rounds 5

# Output to file
magpie review 123 --output review.md
```

## Configuration

Edit `~/.magpie/config.yaml`:

```yaml
providers:
  anthropic:
    api_key: ${ANTHROPIC_API_KEY}
  openai:
    api_key: ${OPENAI_API_KEY}

defaults:
  max_rounds: 3

reviewers:
  security-expert:
    model: claude-sonnet-4-20250514
    prompt: |
      You are a security expert...

  performance-expert:
    model: gpt-4o
    prompt: |
      You are a performance expert...

summarizer:
  model: claude-sonnet-4-20250514
  prompt: |
    You are a neutral summarizer...
```

## License

MIT
