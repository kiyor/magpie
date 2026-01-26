import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { execSync } from 'child_process'
import { loadConfig } from '../config/loader.js'
import { createProvider } from '../providers/factory.js'
import { DebateOrchestrator } from '../orchestrator/orchestrator.js'
import type { Reviewer } from '../orchestrator/types.js'
import { createInterface } from 'readline'

interface ReviewTarget {
  type: 'pr' | 'local' | 'branch' | 'files'
  label: string
  diff?: string  // For local modes, we provide the diff directly
  pr?: string    // For PR mode
}

function getLocalDiff(): string {
  try {
    // Get both staged and unstaged changes
    const staged = execSync('git diff --cached', { encoding: 'utf-8' })
    const unstaged = execSync('git diff', { encoding: 'utf-8' })
    const diff = staged + unstaged
    if (!diff.trim()) {
      throw new Error('No local changes found')
    }
    return diff
  } catch (error) {
    if (error instanceof Error && error.message === 'No local changes found') {
      throw error
    }
    throw new Error('Failed to get local diff. Are you in a git repository?')
  }
}

function getBranchDiff(baseBranch?: string): string {
  try {
    // Detect default branch if not specified
    const base = baseBranch || execSync('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo "origin/main"', { encoding: 'utf-8' }).trim().replace('refs/remotes/', '')
    const diff = execSync(`git diff ${base}...HEAD`, { encoding: 'utf-8' })
    if (!diff.trim()) {
      throw new Error(`No changes found between ${base} and HEAD`)
    }
    return diff
  } catch (error) {
    if (error instanceof Error && error.message.includes('No changes found')) {
      throw error
    }
    throw new Error('Failed to get branch diff. Are you in a git repository?')
  }
}

function getFilesDiff(files: string[]): string {
  try {
    // Get diff for specific files (both staged and unstaged)
    const fileList = files.join(' ')
    const staged = execSync(`git diff --cached -- ${fileList}`, { encoding: 'utf-8' })
    const unstaged = execSync(`git diff -- ${fileList}`, { encoding: 'utf-8' })
    const diff = staged + unstaged
    if (!diff.trim()) {
      // If no diff, show the file contents as "new" files
      let content = ''
      for (const file of files) {
        try {
          const fileContent = execSync(`cat "${file}"`, { encoding: 'utf-8' })
          content += `=== ${file} ===\n${fileContent}\n\n`
        } catch {
          // File might not exist
        }
      }
      if (!content) {
        throw new Error('No changes or content found for specified files')
      }
      return content
    }
    return diff
  } catch (error) {
    if (error instanceof Error && error.message.includes('No changes')) {
      throw error
    }
    throw new Error('Failed to get files diff')
  }
}

export const reviewCommand = new Command('review')
  .description('Review code changes with multiple AI reviewers')
  .argument('[pr]', 'PR number or URL (optional if using --local, --branch, or --files)')
  .option('-c, --config <path>', 'Path to config file')
  .option('-r, --rounds <number>', 'Maximum debate rounds', '3')
  .option('-i, --interactive', 'Interactive mode (pause between turns)')
  .option('-o, --output <file>', 'Output to file instead of stdout')
  .option('-f, --format <format>', 'Output format (markdown|json)', 'markdown')
  .option('--no-converge', 'Disable early stop when reviewers reach consensus')
  .option('-l, --local', 'Review local uncommitted changes')
  .option('-b, --branch [base]', 'Review current branch vs base (default: main)')
  .option('--files <files...>', 'Review specific files')
  .action(async (pr: string | undefined, options) => {
    const spinner = ora('Loading configuration...').start()

    try {
      const config = loadConfig(options.config)
      spinner.succeed('Configuration loaded')

      // Determine review target
      let target: ReviewTarget

      if (options.local) {
        spinner.start('Getting local changes...')
        const diff = getLocalDiff()
        spinner.succeed('Local changes loaded')
        target = { type: 'local', label: 'Local Changes', diff }
      } else if (options.branch !== undefined) {
        const baseBranch = typeof options.branch === 'string' ? options.branch : undefined
        spinner.start('Getting branch diff...')
        const diff = getBranchDiff(baseBranch)
        const currentBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim()
        spinner.succeed('Branch diff loaded')
        target = { type: 'branch', label: `Branch: ${currentBranch}`, diff }
      } else if (options.files) {
        spinner.start('Getting files diff...')
        const diff = getFilesDiff(options.files)
        spinner.succeed('Files loaded')
        target = { type: 'files', label: `Files: ${options.files.join(', ')}`, diff }
      } else if (pr) {
        target = { type: 'pr', label: `PR #${pr}`, pr }
      } else {
        spinner.fail('Error')
        console.error(chalk.red('Error: Please specify a PR number or use --local, --branch, or --files'))
        process.exit(1)
      }

      // Create reviewers
      const reviewers: Reviewer[] = Object.entries(config.reviewers).map(([id, cfg]) => ({
        id,
        provider: createProvider(cfg.model, config),
        systemPrompt: cfg.prompt
      }))

      // Create summarizer
      const summarizer: Reviewer = {
        id: 'summarizer',
        provider: createProvider(config.summarizer.model, config),
        systemPrompt: config.summarizer.prompt
      }

      // Create analyzer
      const analyzer: Reviewer = {
        id: 'analyzer',
        provider: createProvider(config.analyzer.model, config),
        systemPrompt: config.analyzer.prompt
      }

      const maxRounds = parseInt(options.rounds, 10)
      // Convergence: default from config, CLI can override with --no-converge
      const checkConvergence = options.converge !== false && (config.defaults.check_convergence !== false)

      console.log()
      console.log(chalk.bgBlue.white.bold(` ${target.label} Review `))
      console.log(chalk.dim(`├─ Reviewers: ${reviewers.map(r => chalk.cyan(r.id)).join(', ')}`))
      console.log(chalk.dim(`├─ Max rounds: ${maxRounds}`))
      console.log(chalk.dim(`└─ Convergence: ${checkConvergence ? 'enabled' : 'disabled'}`))

      // Setup interactive mode if enabled
      let rl: ReturnType<typeof createInterface> | null = null
      if (options.interactive) {
        rl = createInterface({
          input: process.stdin,
          output: process.stdout
        })
      }

      let currentReviewer = ''
      let currentRound = 1

      let waitingSpinner: ReturnType<typeof ora> | null = null

      const orchestrator = new DebateOrchestrator(reviewers, summarizer, analyzer, {
        maxRounds,
        interactive: options.interactive,
        checkConvergence,
        onWaiting: (reviewerId) => {
          if (waitingSpinner) {
            waitingSpinner.stop()
          }
          const label = reviewerId === 'analyzer' ? 'Analyzing changes...' :
                       reviewerId === 'summarizer' ? 'Generating final summary...' :
                       reviewerId === 'convergence-check' ? 'Checking convergence...' :
                       `${reviewerId} is thinking...`
          waitingSpinner = ora(label).start()
        },
        onMessage: (reviewerId, chunk) => {
          if (waitingSpinner) {
            waitingSpinner.stop()
            waitingSpinner = null
          }
          if (reviewerId !== currentReviewer) {
            currentReviewer = reviewerId
            if (reviewerId === 'analyzer') {
              console.log(chalk.magenta.bold(`\n${'─'.repeat(50)}`))
              console.log(chalk.magenta.bold(`  📋 Analysis`))
              console.log(chalk.magenta.bold(`${'─'.repeat(50)}\n`))
            } else {
              console.log(chalk.cyan.bold(`\n┌─ ${reviewerId} `) + chalk.dim(`[Round ${currentRound}/${maxRounds}]`))
              console.log(chalk.cyan(`│`))
            }
          }
          process.stdout.write(chunk)
        },
        onRoundComplete: (round, converged) => {
          console.log()
          if (converged) {
            console.log(chalk.green.bold(`\n✅ Round ${round}/${maxRounds} - CONSENSUS REACHED`))
            console.log(chalk.green(`   Stopping early to save tokens.\n`))
          } else {
            console.log(chalk.dim(`── Round ${round}/${maxRounds} complete ──\n`))
          }
          currentRound = round + 1
        },
        onInteractive: options.interactive ? async () => {
          return new Promise((resolve) => {
            rl!.question(chalk.yellow('\n💬 Press Enter to continue, type to interject, or q to end: '), (answer) => {
              resolve(answer || null)
            })
          })
        } : undefined
      })

      // Build the prompt based on target type
      let initialPrompt: string
      if (target.diff) {
        initialPrompt = `Please review the following code changes:\n\n\`\`\`diff\n${target.diff}\n\`\`\`\n\nAnalyze these changes and provide your feedback.`
      } else {
        initialPrompt = `Please review PR #${target.pr}. Get the PR details and diff using any method available to you, then analyze the changes.`
      }

      const result = await orchestrator.runStreaming(target.pr || target.label, initialPrompt, target.diff)

      // Final conclusion with nice formatting
      console.log(chalk.green.bold(`\n${'═'.repeat(50)}`))
      console.log(chalk.green.bold(`  🎯 Final Conclusion`))
      console.log(chalk.green.bold(`${'═'.repeat(50)}\n`))
      console.log(result.finalConclusion)

      // Display token usage
      console.log(chalk.dim(`\n${'─'.repeat(50)}`))
      console.log(chalk.dim(`  📊 Token Usage (Estimated)`))
      console.log(chalk.dim(`${'─'.repeat(50)}`))
      let totalInput = 0
      let totalOutput = 0
      let totalCost = 0
      for (const usage of result.tokenUsage) {
        totalInput += usage.inputTokens
        totalOutput += usage.outputTokens
        totalCost += usage.estimatedCost || 0
        const pad = 12 - usage.reviewerId.length
        console.log(chalk.dim(`  ${usage.reviewerId}${' '.repeat(Math.max(0, pad))} ${usage.inputTokens.toLocaleString().padStart(8)} in  ${usage.outputTokens.toLocaleString().padStart(8)} out`))
      }
      console.log(chalk.dim(`${'─'.repeat(50)}`))
      console.log(chalk.yellow(`  Total${' '.repeat(6)} ${totalInput.toLocaleString().padStart(8)} in  ${totalOutput.toLocaleString().padStart(8)} out  ~$${totalCost.toFixed(4)}`))

      if (result.convergedAtRound) {
        console.log(chalk.green(`\n  ✓ Converged at round ${result.convergedAtRound}`))
      }

      if (options.output) {
        const { writeFileSync } = await import('fs')
        if (options.format === 'json') {
          writeFileSync(options.output, JSON.stringify(result, null, 2))
        } else {
          writeFileSync(options.output, formatMarkdown(result))
        }
        console.log(chalk.green(`\n  ✓ Output saved to: ${options.output}`))
      }

      console.log()

      rl?.close()
    } catch (error) {
      spinner.fail('Error')
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`))
      }
      process.exit(1)
    }
  })

function formatMarkdown(result: any): string {
  let md = `# Code Review: ${result.prNumber}\n\n`
  md += `## Analysis\n\n${result.analysis}\n\n`
  md += `## Debate\n\n`

  for (const msg of result.messages) {
    md += `### ${msg.reviewerId}\n\n${msg.content}\n\n`
  }

  md += `## Summaries\n\n`
  for (const summary of result.summaries) {
    md += `### ${summary.reviewerId}\n\n${summary.summary}\n\n`
  }

  md += `## Final Conclusion\n\n${result.finalConclusion}\n`

  return md
}
