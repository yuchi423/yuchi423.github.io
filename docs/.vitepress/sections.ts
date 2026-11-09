export const sections = {
  tech: { label: '技术', link: '/tech/' },
  essay: { label: '随笔', link: '/essay/' }
}

export type Section = keyof typeof sections

export function articleSection(path: string): Section | undefined {
  const match = path.match(/^(tech|essay)\/(?!index\.md$).+\.md$/)
  return match?.[1] as Section | undefined
}
