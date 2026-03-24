#!/usr/bin/env node

import { Command } from 'commander';
import * as p from '@clack/prompts';
import color from 'picocolors';
import { parsePromptfoo } from '@eva-llm/eva-parser';
import { readFileSync } from 'node:fs';
import { uuidv7 } from 'uuidv7';

const program = new Command();

program
  .name('eva-cli')
  .version('0.1.0')
  .description('tool for local runs and debugging of eva-run');

program
  .command('run')
  .argument('[suite]', 'Path to the test suite')
  .option('-r, --remote', 'Run on eva-run cluster', true)
  .action(async (suite, options) => {
    p.intro(`${color.bgCyan(color.black(' EVA-LLM '))}`);

    const path = suite || await p.text({
      message: 'Which test suite do you want to run?',
      placeholder: './tests/my-agent.yaml',
      validate: (value) => {
        if (!value) return 'Please enter a path';
      }
    });

    if (p.isCancel(path)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }

    const s = p.spinner();

    const fileContent = readFileSync(path, 'utf-8');
    const evalRequest = parsePromptfoo(fileContent);
    const runId = uuidv7();

    for (const evaTest of evalRequest) {
      s.message(color.yellow('Submitting to eva-run cluster (localhost:3000)...'));

      const response = await fetch('http://localhost:3000/eval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId, ...evaTest }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();

      s.stop(color.green(`Submission successful! ${JSON.stringify(result)}`));
    }

    s.stop(color.green('Test suite submitted successfully!'));

    p.outro('Happy testing!');
  });

program.parse();
