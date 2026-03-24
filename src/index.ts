#!/usr/bin/env node

import { Command } from 'commander';
import * as p from '@clack/prompts';
import color from 'picocolors';

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
    s.start(`Connecting to eva-run (Target: ${options.remote ? 'Remote' : 'Local'})...`);
    
    // Mock logic of eva-run (Postgres/Redis+ClickHouse) interaction
    await new Promise((res) => setTimeout(res, 2000)); 

    s.stop(color.green('Test suite submitted successfully!'));

    p.note(
      `Dashboard: ${color.underline('https://eva-web.local/results/123')}`,
      'Next Steps'
    );

    p.outro('Happy testing!');
  });

program.parse();
