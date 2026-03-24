# eva-cli

A terminal-based tool for local runs and debugging of eva-run.

## Features
- Run test suites locally or on a remote eva-run cluster
- Interactive prompts for suite selection
- Simple CLI interface

## Installation

```
pnpm install -g eva-cli
```

## Usage

```
eva-llm run [suite] [options]
```

- `suite`: Path to the test suite YAML file (optional; will prompt if omitted)
- `-r, --remote`: Run on eva-run cluster (default: true)

Example:

```
eva-llm run ./tests/my-agent.yaml --remote
```

## Development

- Build: `pnpm run build`
- Run: `pnpm run bin`

## License

MIT
