import { describe, it, expect } from 'vitest';
import {
  generateBashCompletion,
  generateZshCompletion,
  generateFishCompletion,
} from './completion.js';

describe('Shell Completion Generators', () => {
  it('generates valid Bash completion script', () => {
    const script = generateBashCompletion('stellar-alerts-cli');
    expect(script).toContain('#!/usr/bin/env bash');
    expect(script).toContain('complete -F _stellar_alerts_cli_completions stellar-alerts-cli');
    expect(script).toContain('root_commands="wallet stream profile health completion"');
  });

  it('generates valid Zsh completion script', () => {
    const script = generateZshCompletion('stellar-alerts-cli');
    expect(script).toContain('#compdef stellar-alerts-cli');
    expect(script).toContain('_stellar_alerts_cli()');
    expect(script).toContain("'completion:Generate shell autocompletion script'");
  });

  it('generates valid Fish completion script', () => {
    const script = generateFishCompletion('stellar-alerts-cli');
    expect(script).toContain('complete -c stellar-alerts-cli -f');
    expect(script).toContain('complete -c stellar-alerts-cli -n "__fish_use_subcommand" -a completion');
  });
});
