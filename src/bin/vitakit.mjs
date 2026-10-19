#!/usr/bin/env node
/**
 * The vitakit command; see `pnpm vitakit --help` or docs/cli.md.
 */
import process from 'node:process'
import { main } from '../../dist/cli.mjs'

process.exitCode = await main(process.argv.slice(2))
