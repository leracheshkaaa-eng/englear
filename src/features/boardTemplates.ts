/** Starting layouts for a new whiteboard (drawn by templateElements in boardEditor.tsx). */
export const TEMPLATES = ['empty', 'tenses', 'cards', 'plan'] as const
export type Template = (typeof TEMPLATES)[number]
