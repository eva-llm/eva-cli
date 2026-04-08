A terminal-based tool for local runs and debugging of [eva-run](https://eva-llm.github.io/eva-run).

It uses [eva-parser](https://eva-llm.github.io/eva-parser) to convert [Promptfoo](https://www.promptfoo.dev/docs/getting-started) config into `eva-run` tasks.

## Quick Start

```bash
npm i -g @eva-llm/eva-cli
export DATABASE_URL="postgresql://..." # required for results monitoring
eva-llm run /path/to/promptfooconfig.yaml
```

## Settings

By default it searches `eva-run` instance in `localhost:3000`, but could be customised with enviroment variable `EVA_RUN_HOST`.

## Tests Format

It supports restricted Promptfoo format and extends it with own features.

Full details in `eva-parser` [specification](https://eva-llm.github.io/eva-parser/#supported-promptfoo-items).

## License

MIT
