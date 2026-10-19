/**
 * The vitakit fox, after assets/logo/logo_icon.svg: diving nose-first, ears
 * up, paws tucked, tail streaming behind. Plain ASCII, 53 columns by 16 lines.
 * Shown when `vitakit` runs without arguments.
 */
const FOX = [
  "                                      __..--''/\\ /\\",
  "                                _.--''          V  \\",
  "                           _.-''                    \\",
  "                        .-'                         |",
  "    _.--~~~~--..__    ,'            ,--.__      ^.  /",
  " .-'              ``-.'             `-.   `-.      /",
  "(_                    /                \\  ( (   . /",
  "  ``--..____...--''  /             _.-' \\  \\ \\  `-'",
  "                    |          _.-'      `-\\_)_)",
  "                    |      _.-'",
  "                    |  _.-'",
  "                   / .'",
  "                  / /",
  "                 | |",
  "                 | |",
  "                 |_|",
]

/** Where the text beside the fox starts: below its head, right of its body. */
const TEXT_ROW = 10
const TEXT_COLUMN = 37

/** Columns the banner needs; narrower terminals get no banner. */
export const BANNER_WIDTH = 61

export function banner(version: string, paint: { fox: (text: string) => string, bold: (text: string) => string }): string {
  const text = [paint.bold(`vitakit ${version}`), '', 'one leap, two landings:', 'your website and', 'a typeset CV']
  return FOX.map((line, index) => {
    const beside = text[index - TEXT_ROW]
    return beside ? paint.fox(line.padEnd(TEXT_COLUMN)) + beside : paint.fox(line)
  }).join('\n')
}
