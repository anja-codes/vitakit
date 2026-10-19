/**
 * Questions for interactive sessions. Commands only ask when `io.interactive`;
 * otherwise they take flags or documented defaults.
 */
import type { Io } from './io'

export interface Choice<T> {
  label: string
  value: T
}

/** A numbered list; Enter takes the default. */
export async function choose<T>(io: Io, question: string, choices: Choice<T>[], defaultIndex = 0): Promise<T> {
  io.out(`\n${question}\n`)
  choices.forEach((choice, index) => io.out(`  ${index + 1}  ${choice.label}${index === defaultIndex ? '   (Enter)' : ''}\n`))
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = (await io.ask('> ')).trim()
    if (answer === '') return choices[defaultIndex]!.value
    const number = Number(answer)
    if (Number.isInteger(number) && number >= 1 && number <= choices.length) return choices[number - 1]!.value
    const named = choices.find(choice => choice.label.toLowerCase() === answer.toLowerCase())
    if (named) return named.value
    io.out(`  A number from 1 to ${choices.length}, please.\n`)
  }
  return choices[defaultIndex]!.value
}

export async function confirm(io: Io, question: string, yes = true): Promise<boolean> {
  const answer = (await io.ask(`${question} ${yes ? '[Y/n]' : '[y/N]'} `)).trim().toLowerCase()
  if (answer === '') return yes
  return answer === 'y' || answer === 'yes'
}

export async function input(io: Io, question: string, fallback?: string): Promise<string> {
  const answer = (await io.ask(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim()
  return answer || fallback || ''
}

/** `research-stays` → `Research stays` */
export function headingFor(id: string): string {
  const words = id.split('-').join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
