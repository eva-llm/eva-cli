#!/usr/bin/env node

import { Command } from 'commander';
import * as p from '@clack/prompts';
import color from 'picocolors';
import { parsePromptfoo } from '@eva-llm/eva-parser';
import { readFileSync } from 'node:fs';
import { uuidv7 } from 'uuidv7';
import { request } from 'undici';

import { observe } from './utils';
import { type TReport } from './types';

const HOST = process.env.EVA_RUN_HOST || 'localhost:3000';
const program = new Command();

program
  .name('eva-cli')
  .version('1.0.0')
  .description('cli tool for local runs and debugging of eva-run');

program
  .command('run')
  .argument('[suite]', 'Path to the test suite')
  .action(async (suite) => {
    p.intro(`${color.bgCyan(color.black(' EVA-LLM '))}`);

    const path = suite || await p.text({
      message: 'Provide path to the test suite:',
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
    const evaTasks = parsePromptfoo(fileContent);
    const runId = uuidv7();

    console.log(color.yellow(`Submitting to eva-run cluster (${HOST})...`));

    const response = await request(`http://${HOST}/eval`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(evaTasks.map(task => ({ run_id: runId, ...task }))),
      // NOTE: Optional, for stability
      bodyTimeout: 0, 
      headersTimeout: 0,
    });

    if (response.statusCode !== 200) {
      throw new Error(`Server responded with ${response.statusCode}: ${await response.body.text()}`);
    }

    const result = await response.body.json() as { test_ids: string[] };

    console.log(color.yellow(`${result.test_ids.length} test(s) are started...`));

    const report = await observe(runId, result.test_ids);

    printReport(report);

    p.outro(color.magenta('All done. Exiting...'));
    process.exit(0);
  });

program.parse();

function printReport(report: TReport) {
  const { testsAmount, passedTestsAmount, failedTests, epistemicTests } = report;

  if (failedTests.length > 0) {
    console.log(color.red('Failed test details:'));

    for (const test of failedTests) {
      console.log(color.yellow('Prompt:'), test.prompt);
      console.log(color.yellow('Output:'), test.output);

      for (const assert of test.asserts!) {
        console.log(color.red('- criteria:'), assert.criteria);
        console.log(color.red('  reason:'), assert.reason);
        console.log(color.bold(`  passed: ${assert.passed}; score: ${assert.score}; threshold: ${assert.threshold}${assert.metadata?.must_fail === undefined ? '' : `; must_fail: ${assert.metadata?.must_fail}`}.`));
        console.log();
      }
      console.log();
    }
  }

  if (epistemicTests.length > 0) {
    console.log(color.cyan('Epistemic test details:'));

    for (const test of epistemicTests) {
      console.log(color.yellow('Prompt:'), test.prompt);
      console.log(color.yellow('Output:'), test.output);
      console.log(color.blue(`Epistemic Honesty: ${test.honesty.toFixed(3)}; Symmetry Deviation: ${test.deviation.toFixed(3)}.`));
      console.log();
    }
  }

  console.log(color.cyan(`Epistemic tests: ${epistemicTests.length}`));
  console.log(color.red(`Failed tests: ${failedTests.length}`));
  console.log(color.green(`Passed tests: ${passedTestsAmount}`));
  console.log(color.bold(`Total tests: ${testsAmount}`));
}
